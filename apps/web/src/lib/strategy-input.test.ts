import { describe, expect, it } from "vitest";
import { buildStrategyInsert, StrategyCreateInputSchema } from "./strategy-input";

describe("web strategy request input", () => {
  it("stores strategy prompts as queued research requests without running agents", () => {
    const parsed = StrategyCreateInputSchema.parse({
      leverage: 10,
      market: "BTC-PERP",
      prompt:
        "Use volatility, funding, liquidity, and leverage-aware filters on the 15m timeframe.",
      risk_profile: "high-risk",
      timeframe: "15m"
    });

    const insert = buildStrategyInsert(
      "did:privy:user",
      parsed,
      "2026-07-01T00:00:00.000Z"
    );

    expect(insert).toMatchObject({
      deployment_status: "not_configured",
      leverage: 10,
      market: "BTC-PERP",
      owner_privy_did: "did:privy:user",
      risk_profile: "high-risk",
      scan_cadence: "Every 15 minutes",
      schedule: "Paper review only",
      status: "queued",
      timeframe: "15m",
      updated_at: "2026-07-01T00:00:00.000Z"
    });
    expect(insert.summary).toContain(
      "Managed research and backtesting are not enabled"
    );
    expect(insert.factors).toEqual([
      "Volatility expansion",
      "Funding pressure",
      "Orderbook/liquidity imbalance",
      "Leverage-aware risk envelope"
    ]);
  });

  it("rejects fractional leverage because the schema stores leverage as an integer", () => {
    expect(() =>
      StrategyCreateInputSchema.parse({
        leverage: 10.5,
        prompt: "fractional leverage should not be accepted"
      })
    ).toThrow();
  });
});
