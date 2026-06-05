import { describe, expect, it } from "vitest";
import { SqliteEventLog } from "@openstrat/persistence";
import {
  createFakePiAgentSessionFactory,
  createPiAgentRuntimeAdapter
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
