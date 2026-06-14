import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEventLog } from "@openstrat/persistence";
import type { AgentToolGateway } from "@openstrat/workers";
import {
  FakeCodexAppServerRuntimeAdapter,
  FileCodexAppServerBindingStore,
  FileCodexAppServerTranscriptStore,
  type CodexAppServerRuntimeAdapter
} from "./codex-app-server-adapter.js";

const now = "2026-06-11T00:00:00.000Z";

describe("Codex app-server runtime adapter", () => {
  it("starts, prompts, and disposes fake Codex app-server sessions", async () => {
    const adapter = new FakeCodexAppServerRuntimeAdapter({
      now: () => now
    });
    const runtime = await adapter.startSession({
      manifest: codexManifest("agent_session_codex_001"),
      toolNames: ["market_data.read_snapshot"]
    });

    await adapter.prompt({
      session_id: "agent_session_codex_001",
      prompt: "Research BTC funding context."
    });
    await adapter.dispose("agent_session_codex_001");

    expect(runtime).toMatchObject({
      session_id: "agent_session_codex_001",
      runtime_session_id: "codex_app_server_agent_session_codex_001",
      codex_thread_id: "codex_thread_agent_session_codex_001",
      enabled_tools: ["market_data.read_snapshot"],
      disabled_native_tools: expect.arrayContaining(["shell", "apply_patch"])
    });
    expect(runtime.transcript_ref).toContain("agent_session_codex_001.jsonl");
    expect(adapter.promptsFor("agent_session_codex_001")).toEqual([
      "Research BTC funding context."
    ]);
    await expect(
      adapter.prompt({
        session_id: "agent_session_codex_001",
        prompt: "after dispose"
      })
    ).rejects.toThrow(/not found/);
  });

  it("resumes and forks using explicit Codex thread ids", async () => {
    const adapter: CodexAppServerRuntimeAdapter = new FakeCodexAppServerRuntimeAdapter({
      now: () => now
    });

    const resumed = await adapter.resumeSession({
      manifest: codexManifest("agent_session_codex_resume"),
      toolNames: [],
      codex_thread_id: "codex_thread_existing",
      transcript_ref: "agent-runtime/sessions/existing.jsonl"
    });
    const forked = await adapter.forkSession({
      manifest: codexManifest("agent_session_codex_side"),
      toolNames: [],
      parent_session_id: "agent_session_codex_resume",
      parent_codex_thread_id: resumed.codex_thread_id,
      parent_transcript_ref: resumed.transcript_ref
    });

    expect(resumed).toMatchObject({
      codex_thread_id: "codex_thread_existing",
      resumed_from_codex_thread_id: "codex_thread_existing",
      transcript_ref: "agent-runtime/sessions/existing.jsonl"
    });
    expect(forked).toMatchObject({
      parent_session_id: "agent_session_codex_resume",
      parent_codex_thread_id: "codex_thread_existing",
      parent_transcript_ref: "agent-runtime/sessions/existing.jsonl"
    });
    expect(forked.codex_thread_id).not.toBe(resumed.codex_thread_id);
  });

  it("rejects non-Codex runtime manifests", async () => {
    const adapter = new FakeCodexAppServerRuntimeAdapter();

    await expect(
      adapter.startSession({
        manifest: {
          ...codexManifest("agent_session_wrong_runtime"),
          runtime: {
            kind: "pi",
            adapter: "@openstrat/agent-runtime/pi",
            model_profile_id: "model/openai-codex-subscription"
          }
        },
        toolNames: []
      })
    ).rejects.toThrow(/codex_app_server/);
  });

  it("persists Codex thread bindings and projects runtime transcripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstrat-codex-runtime-"));
    const events = new SqliteEventLog(":memory:");
    const bindingStore = new FileCodexAppServerBindingStore(root);
    const transcriptStore = new FileCodexAppServerTranscriptStore(root);
    const adapter = new FakeCodexAppServerRuntimeAdapter({
      bindingStore,
      events,
      now: () => now,
      transcriptStore
    });

    const runtime = await adapter.startSession({
      manifest: codexManifest("agent_session_codex_bound"),
      toolNames: ["market_data.read_snapshot"]
    });
    await adapter.prompt({
      session_id: runtime.session_id,
      prompt: "Research BTC funding context."
    });

    expect(bindingStore.read("agent_session_codex_bound")).toMatchObject({
      openstrat_session_id: "agent_session_codex_bound",
      runtime_session_id: "codex_app_server_agent_session_codex_bound",
      codex_thread_id: "codex_thread_agent_session_codex_bound",
      transcript_ref: runtime.transcript_ref,
      created_at: now,
      updated_at: now
    });
    expect(runtime.transcript_ref.startsWith(root)).toBe(true);
    expect(runtime.transcript_ref).toContain("agent-runtime");
    expect(existsSync(runtime.transcript_ref)).toBe(true);

    const stream = events.list("agent_sessions/agent_session_codex_bound");
    expect(stream.map((event) => event.type)).toEqual([
      "agent.runtime.session_started",
      "agent.runtime.turn_started",
      "agent.runtime.message_delta",
      "agent.runtime.turn_completed"
    ]);
    expect(stream.at(0)).toMatchObject({
      type: "agent.runtime.session_started",
      metadata: {
        codex_thread_id: "codex_thread_agent_session_codex_bound",
        runtime: "codex_app_server",
        runtime_session_id: "codex_app_server_agent_session_codex_bound",
        transcript_ref: runtime.transcript_ref
      },
      payload: {
        codex_thread_id: "codex_thread_agent_session_codex_bound",
        runtime: "codex_app_server",
        runtime_session_id: "codex_app_server_agent_session_codex_bound"
      }
    });

    const lines = (await readFile(runtime.transcript_ref, "utf8")).trim().split("\n");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      type: "session",
      version: 3,
      id: "agent_session_codex_bound"
    });
    expect(
      lines
        .map((line) => JSON.parse(line) as { data?: { type?: string } })
        .filter((entry) => entry.data)
        .map((entry) => entry.data?.type)
    ).toEqual([
      "agent.runtime.session_started",
      "agent.runtime.turn_started",
      "agent.runtime.message_delta",
      "agent.runtime.turn_completed"
    ]);
  });

  it("resumes with durable Codex thread bindings", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstrat-codex-runtime-"));
    const events = new SqliteEventLog(":memory:");
    const bindingStore = new FileCodexAppServerBindingStore(root);
    const transcriptStore = new FileCodexAppServerTranscriptStore(root);
    const adapter = new FakeCodexAppServerRuntimeAdapter({
      bindingStore,
      events,
      now: () => now,
      transcriptStore
    });

    const started = await adapter.startSession({
      manifest: codexManifest("agent_session_codex_resume_bound"),
      toolNames: []
    });
    const resumed = await adapter.resumeSession({
      manifest: codexManifest("agent_session_codex_resume_bound"),
      toolNames: [],
      codex_thread_id: started.codex_thread_id,
      transcript_ref: started.transcript_ref
    });

    expect(resumed).toMatchObject({
      codex_thread_id: started.codex_thread_id,
      resumed_from_codex_thread_id: started.codex_thread_id,
      transcript_ref: started.transcript_ref
    });
    expect(bindingStore.read("agent_session_codex_resume_bound")).toMatchObject({
      openstrat_session_id: "agent_session_codex_resume_bound",
      codex_thread_id: started.codex_thread_id,
      transcript_ref: started.transcript_ref
    });
    expect(
      events
        .list("agent_sessions/agent_session_codex_resume_bound")
        .map((event) => event.type)
    ).toEqual(["agent.runtime.session_started", "agent.runtime.session_resumed"]);
    expect(
      transcriptStore
        .read(started.transcript_ref)
        .map((entry) => entry as { data?: { type?: string } })
        .filter((entry) => entry.data)
        .at(-1)?.data?.type
    ).toBe("agent.runtime.session_resumed");
  });

  it("routes Codex app-server tool requests through the agent tool gateway", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstrat-codex-runtime-"));
    const events = new SqliteEventLog(":memory:");
    const gatewayInvocations: unknown[] = [];
    const adapter = new FakeCodexAppServerRuntimeAdapter({
      events,
      now: () => now,
      runtimeEvents: [
        {
          type: "tool_call_requested",
          tool_call_id: "tool_call_market",
          tool_name: "market_data.read_snapshot",
          arguments: {
            canonical_symbol: "ETH-PERP"
          }
        },
        {
          type: "message_delta",
          delta: "Market data received."
        },
        {
          type: "turn_completed",
          assistant_text: "Market data received.",
          message_count: 1
        }
      ],
      toolGateway: recordingToolGateway(gatewayInvocations),
      transcriptStore: new FileCodexAppServerTranscriptStore(root)
    });

    const session = await adapter.startSession({
      manifest: codexManifest("agent_session_codex_tool_bridge"),
      toolNames: ["market_data.read_snapshot"]
    });
    await adapter.prompt({
      session_id: session.session_id,
      prompt: "Read the latest ETH market data."
    });

    expect(gatewayInvocations).toEqual([
      {
        call_id: "tool_call_market",
        session_id: "agent_session_codex_tool_bridge",
        turn_id: "agent_session_codex_tool_bridge:turn:tool_call_market",
        tool_name: "market_data.read_snapshot",
        arguments: {
          canonical_symbol: "ETH-PERP"
        }
      }
    ]);
    expect(
      events.list("agent_sessions/agent_session_codex_tool_bridge").map((event) => ({
        type: event.type,
        payload: event.payload
      }))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent.runtime.tool_call_requested",
          payload: expect.objectContaining({
            tool_call_id: "tool_call_market",
            tool_name: "market_data.read_snapshot"
          })
        }),
        expect.objectContaining({
          type: "agent.runtime.tool_call_completed",
          payload: expect.objectContaining({
            tool_call_id: "tool_call_market",
            tool_name: "market_data.read_snapshot",
            result: {
              status: "completed",
              result_ref: "market-data/hyperliquid/eth/latest.json",
              side_effect: "none"
            },
            is_error: false,
            result_ref: "market-data/hyperliquid/eth/latest.json"
          })
        })
      ])
    );
  });

  it("blocks disabled Codex native tool requests before gateway invocation", async () => {
    const events = new SqliteEventLog(":memory:");
    const gatewayInvocations: unknown[] = [];
    const adapter = new FakeCodexAppServerRuntimeAdapter({
      events,
      now: () => now,
      runtimeEvents: [
        {
          type: "tool_call_requested",
          tool_call_id: "tool_call_shell",
          tool_name: "shell",
          arguments: {
            command: "pwd"
          }
        },
        {
          type: "turn_completed",
          assistant_text: "Native tool request blocked.",
          message_count: 1
        }
      ],
      toolGateway: recordingToolGateway(gatewayInvocations)
    });

    const session = await adapter.startSession({
      manifest: codexManifest("agent_session_codex_native_block"),
      toolNames: ["market_data.read_snapshot"]
    });
    await adapter.prompt({
      session_id: session.session_id,
      prompt: "Check the current directory."
    });

    expect(gatewayInvocations).toEqual([]);
    expect(
      events.list("agent_sessions/agent_session_codex_native_block").map((event) => ({
        type: event.type,
        payload: event.payload
      }))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "agent.runtime.tool_call_requested",
          payload: expect.objectContaining({
            tool_call_id: "tool_call_shell",
            tool_name: "shell"
          })
        }),
        expect.objectContaining({
          type: "agent.runtime.tool_call_blocked",
          payload: expect.objectContaining({
            tool_call_id: "tool_call_shell",
            tool_name: "shell",
            result: {
              status: "blocked",
              reason: "Codex native tool is disabled by OpenStrat harness policy",
              side_effect: "none"
            },
            reason: "Codex native tool is disabled by OpenStrat harness policy"
          })
        })
      ])
    );
  });
});

function recordingToolGateway(invocations: unknown[]): AgentToolGateway {
  return {
    tool_names: ["market_data.read_snapshot"],
    async invoke(input) {
      invocations.push(input);
      return {
        latest_price: {
          raw_ref: "market-data/hyperliquid/eth/latest.json"
        }
      };
    }
  } as AgentToolGateway;
}

function codexManifest(id: string) {
  return {
    id,
    created_at: now,
    purpose: "strategy_research",
    autonomy_mode: "strategy_workbench",
    runtime: {
      kind: "codex_app_server",
      adapter: "@openstrat/agent-runtime/codex-app-server",
      model_profile_id: "model/openai-codex-subscription",
      provider: "openai-codex",
      model: "gpt-5.5"
    },
    transcript_ref: {
      id: `artifact_transcript_${id}`,
      kind: "agent_transcript",
      uri: `agent-runtime/sessions/${id}.jsonl`,
      content_hash: "sha256:pending",
      created_at: now,
      append_only: true
    },
    event_stream_id: `agent_sessions/${id}`,
    tool_grant_ids: [],
    canonical_ledger_refs: []
  };
}
