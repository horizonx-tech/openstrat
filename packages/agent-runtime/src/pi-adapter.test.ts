import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteEventLog } from "@openstrat/persistence";
import {
  createFakePiAgentSessionFactory,
  createPiAgentRuntimeAdapter,
  FilePiTranscriptStore
} from "./pi-adapter.js";

const now = "2026-06-05T00:00:00.000Z";

describe("Pi agent runtime adapter", () => {
  it("creates in-memory sessions with only explicit harness tools enabled", async () => {
    const events = new SqliteEventLog(":memory:");
    const adapter = createPiAgentRuntimeAdapter({
      events,
      now: () => now,
      sessionFactory: createFakePiAgentSessionFactory()
    });

    const session = await adapter.startSession({
      manifest: {
        id: "agent_session_001",
        created_at: now,
        purpose: "strategy_research",
        autonomy_mode: "strategy_workbench",
        runtime: {
          kind: "pi",
          adapter: "@openstrat/agent-runtime/pi",
          model_profile_id: "model/fake"
        },
        transcript_ref: {
          id: "artifact_transcript_001",
          kind: "agent_transcript",
          uri: "agent-sessions/agent_session_001/session.jsonl",
          content_hash: "sha256:in-memory",
          created_at: now,
          append_only: true
        },
        event_stream_id: "agent_sessions/agent_session_001",
        tool_grant_ids: ["grant_read_market_data"],
        canonical_ledger_refs: []
      },
      toolNames: ["market_data.read_snapshot"]
    });

    expect(session.session_id).toBe("agent_session_001");
    expect(session.enabled_tools).toEqual(["market_data.read_snapshot"]);
    expect(session.disabled_builtin_tools).toEqual(["read", "bash", "edit", "write"]);
    expect(events.list("agent_sessions/agent_session_001").at(0)).toMatchObject({
      type: "agent.runtime.session_started",
      payload: {
        runtime: "pi",
        enabled_tools: ["market_data.read_snapshot"]
      }
    });
  });

  it("projects prompt, tool call, tool result, and agent end events", async () => {
    const events = new SqliteEventLog(":memory:");
    const adapter = createPiAgentRuntimeAdapter({
      events,
      now: () => now,
      sessionFactory: createFakePiAgentSessionFactory({
        events: [
          {
            type: "tool_execution_start",
            toolCallId: "tool_call_001",
            toolName: "market_data.read_snapshot"
          },
          {
            type: "tool_execution_end",
            toolCallId: "tool_call_001",
            toolName: "market_data.read_snapshot",
            isError: false
          },
          {
            type: "agent_end",
            messages: []
          }
        ]
      })
    });

    const session = await adapter.startSession({
      manifest: minimalManifest("agent_session_002"),
      toolNames: ["market_data.read_snapshot"]
    });

    await adapter.prompt({
      session_id: session.session_id,
      prompt: "Check the latest ETH market data."
    });

    expect(
      events.list("agent_sessions/agent_session_002").map((event) => event.type)
    ).toEqual([
      "agent.runtime.session_started",
      "agent.runtime.turn_started",
      "agent.runtime.tool_call_requested",
      "agent.runtime.tool_call_completed",
      "agent.runtime.turn_completed"
    ]);
  });

  it("persists Pi JSONL transcripts under an agent-runtime owned directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstrat-agent-runtime-"));
    const transcriptStore = new FilePiTranscriptStore(root);
    const events = new SqliteEventLog(":memory:");
    const adapter = createPiAgentRuntimeAdapter({
      events,
      now: () => now,
      sessionFactory: createFakePiAgentSessionFactory(),
      transcriptStore
    });

    const session = await adapter.startSession({
      manifest: minimalManifest("agent_session_003"),
      toolNames: ["market_data.read_snapshot"]
    });

    await adapter.prompt({
      session_id: session.session_id,
      prompt: "Summarize ETH market conditions."
    });

    expect(session.transcript_ref.startsWith(root)).toBe(true);
    expect(session.transcript_ref).toContain("agent-runtime");
    expect(existsSync(session.transcript_ref)).toBe(true);

    const lines = (await readFile(session.transcript_ref, "utf8")).trim().split("\n");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      type: "session",
      version: 3,
      id: "agent_session_003"
    });
    expect(lines.map((line) => JSON.parse(line) as { type: string })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "custom",
          customType: "openstrat.runtime_event"
        })
      ])
    );
    expect(
      events.list("agent_sessions/agent_session_003").at(-1)?.metadata
    ).toMatchObject({
      transcript_ref: session.transcript_ref
    });
  });

  it("records resume and fork identifiers without promoting transcript state", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstrat-agent-runtime-"));
    const transcriptStore = new FilePiTranscriptStore(root);
    const events = new SqliteEventLog(":memory:");
    const adapter = createPiAgentRuntimeAdapter({
      events,
      now: () => now,
      sessionFactory: createFakePiAgentSessionFactory(),
      transcriptStore
    });

    const parent = await adapter.startSession({
      manifest: minimalManifest("agent_session_parent"),
      toolNames: ["market_data.read_snapshot"]
    });
    const child = await adapter.forkSession({
      manifest: minimalManifest("agent_session_child"),
      parent_session_id: parent.session_id,
      parent_transcript_ref: parent.transcript_ref,
      toolNames: ["market_data.read_snapshot"]
    });
    const resumed = await adapter.resumeSession({
      manifest: minimalManifest("agent_session_parent"),
      transcript_ref: parent.transcript_ref,
      toolNames: ["market_data.read_snapshot"]
    });

    expect(child.parent_session_id).toBe(parent.session_id);
    expect(resumed.resumed_from_transcript_ref).toBe(parent.transcript_ref);
    expect(events.list("agent_sessions/agent_session_child").at(0)).toMatchObject({
      type: "agent.runtime.session_forked",
      payload: {
        parent_session_id: "agent_session_parent"
      }
    });
  });

  it("replays transcripts read-only without mutating the append-only event log", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstrat-agent-runtime-"));
    const transcriptStore = new FilePiTranscriptStore(root);
    const events = new SqliteEventLog(":memory:");
    const adapter = createPiAgentRuntimeAdapter({
      events,
      now: () => now,
      sessionFactory: createFakePiAgentSessionFactory(),
      transcriptStore
    });

    const session = await adapter.startSession({
      manifest: minimalManifest("agent_session_004"),
      toolNames: ["market_data.read_snapshot"]
    });
    await adapter.prompt({
      session_id: session.session_id,
      prompt: "Check data."
    });

    const before = events.list("agent_sessions/agent_session_004").length;
    const replay = await adapter.replayTranscript({
      transcript_ref: session.transcript_ref
    });
    const after = events.list("agent_sessions/agent_session_004").length;

    expect(replay.entries.length).toBeGreaterThan(0);
    expect(replay.promoted_memory_writes).toBe(0);
    expect(after).toBe(before);
  });
});

function minimalManifest(id: string) {
  return {
    id,
    created_at: now,
    purpose: "strategy_research" as const,
    autonomy_mode: "strategy_workbench" as const,
    runtime: {
      kind: "pi" as const,
      adapter: "@openstrat/agent-runtime/pi",
      model_profile_id: "model/fake"
    },
    transcript_ref: {
      id: `artifact_transcript_${id}`,
      kind: "agent_transcript" as const,
      uri: `agent-sessions/${id}/session.jsonl`,
      content_hash: "sha256:in-memory",
      created_at: now,
      append_only: true as const
    },
    event_stream_id: `agent_sessions/${id}`,
    tool_grant_ids: [],
    canonical_ledger_refs: []
  };
}
