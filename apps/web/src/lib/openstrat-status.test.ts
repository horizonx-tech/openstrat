import { describe, expect, it } from "vitest";
import { getOpenStratWebStatus } from "./openstrat-status";

describe("OpenStrat web status boundary", () => {
  it("exposes deterministic package-backed market status without enabling agents", () => {
    const status = getOpenStratWebStatus();

    expect(status.agent_runtime_enabled).toBe(false);
    expect(status.tool_surface).toEqual({
      endpoint: "/api/openstrat/status",
      package: "@openstrat/market-data",
      side_effects: "none"
    });
    expect(status.market_data).toMatchObject({
      source: "hyperliquid",
      status: "fixture_normalized"
    });
    expect(status.market_data.symbols.map((symbol) => symbol.symbol)).toEqual([
      "BTC-PERP",
      "ETH-PERP",
      "SOL-PERP",
      "HYPE-PERP"
    ]);
    expect(status.market_data.symbols[0]).toMatchObject({
      funding_rate: 0.000081,
      max_leverage: 50,
      open_interest: 9000,
      price: 112000,
      status: "active",
      symbol: "BTC-PERP"
    });
  });
});
