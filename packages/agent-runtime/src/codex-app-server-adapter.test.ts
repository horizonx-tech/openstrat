import { describe, expect, it } from "vitest";
import {
  FakeCodexAppServerRuntimeAdapter,
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
});

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
