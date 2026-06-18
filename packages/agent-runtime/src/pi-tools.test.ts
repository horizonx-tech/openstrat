import { describe, expect, it } from "vitest";
import type { AgentToolGateway } from "@openstrat/workers";
import { createPiAgentGatewayToolDefinitions } from "./pi-tools.js";

describe("Pi gateway tool definitions", () => {
  it("wraps OpenStrat gateway tools as Pi custom tools", async () => {
    const invocations: unknown[] = [];
    const gateway = recordingGateway(invocations, {
      dataset_ref: "datasets/hyperliquid/ETH-PERP/latest.json",
      latest_price_ref: "normalized/hyperliquid/mark-prices/ETH-PERP/latest.json"
    });
    const tools = createPiAgentGatewayToolDefinitions({
      gateway,
      session_id: "agent_session_001",
      toolNames: ["market_data.read_snapshot"]
    });

    expect(tools.map((tool) => tool.name)).toEqual(["market_data.read_snapshot"]);
    expect(tools[0]?.promptSnippet).toContain("OpenStrat harness tool");

    const result = await tools[0]?.execute(
      "tool_call_001",
      { canonical_symbol: "ETH-PERP" },
      new AbortController().signal,
      () => undefined,
      {} as never
    );

    expect(invocations).toEqual([
      {
        call_id: "tool_call_001",
        session_id: "agent_session_001",
        turn_id: "agent_session_001:tool_call_001",
        tool_name: "market_data.read_snapshot",
        arguments: { canonical_symbol: "ETH-PERP" }
      }
    ]);
    expect(result).toMatchObject({
      content: [
        {
          type: "text",
          text: expect.stringContaining("market_data.read_snapshot completed")
        }
      ],
      details: {
        tool_name: "market_data.read_snapshot",
        result_ref: "datasets/hyperliquid/ETH-PERP/latest.json",
        side_effect: "none"
      }
    });
  });
});

function recordingGateway(invocations: unknown[], result: unknown): AgentToolGateway {
  return {
    tool_names: ["market_data.read_snapshot"],
    async invoke(input) {
      invocations.push(input);
      return result;
    }
  } as AgentToolGateway;
}
