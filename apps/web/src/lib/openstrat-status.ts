import {
  deriveHyperliquidMarketRegistry,
  normalizeHyperliquidMetaAndAssetCtxs
} from "@openstrat/market-data";
import type { MarketSignal } from "@/types/openstrat";

const receivedAt = "2026-07-01T00:00:00.000Z";

const fixtureMetaAndAssetCtxs = [
  {
    marginTables: [
      [50, { description: "fixture 50x" }],
      [20, { description: "fixture 20x" }],
      [10, { description: "fixture 10x" }]
    ],
    universe: [
      { maxLeverage: 50, name: "BTC", szDecimals: 5 },
      { maxLeverage: 50, name: "ETH", szDecimals: 4 },
      { maxLeverage: 20, name: "SOL", szDecimals: 2 },
      { maxLeverage: 10, name: "HYPE", szDecimals: 2 }
    ]
  },
  [
    assetCtx("112000.0", "111040.0", "1400000000.0", "9000.0", "0.000081"),
    assetCtx("4300.0", "4214.0", "950000000.0", "180000.0", "0.000042"),
    assetCtx("132.0", "137.4", "320000000.0", "4000000.0", "-0.000018"),
    assetCtx("38.0", "36.9", "120000000.0", "1900000.0", "0.000022")
  ]
];

export function getOpenStratWebStatus() {
  const registry = deriveHyperliquidMarketRegistry(fixtureMetaAndAssetCtxs, {
    received_at: receivedAt,
    raw_ref: "web-fixture/hyperliquid/meta-and-asset-ctxs.json"
  });
  const normalized = normalizeHyperliquidMetaAndAssetCtxs(fixtureMetaAndAssetCtxs, {
    received_at: receivedAt,
    raw_ref: "web-fixture/hyperliquid/meta-and-asset-ctxs.json"
  });
  const assetCtxs = fixtureMetaAndAssetCtxs[1] as Array<{ openInterest: string }>;

  const signals: MarketSignal[] = registry.map((market, index) => {
    const mark = normalized.mark_prices[index];
    const oracle = normalized.oracle_prices[index];
    const funding = normalized.funding_rates[index];
    const assetCtx = assetCtxs[index];
    const price = Number(mark?.value ?? 0);
    const oraclePrice = Number(oracle?.value ?? price);
    return {
      change_24h: price === 0 ? 0 : (price - oraclePrice) / price,
      funding_rate: funding?.funding_rate ?? 0,
      liquidity_score: market.liquidity_score ?? 0,
      max_leverage: market.max_leverage ?? 0,
      open_interest: Number(assetCtx?.openInterest ?? 0),
      price,
      status: market.status,
      symbol: market.canonical_symbol
    };
  });

  return {
    agent_runtime_enabled: false,
    generated_at: new Date().toISOString(),
    market_data: {
      source: "hyperliquid",
      status: "fixture_normalized",
      symbols: signals
    },
    tool_surface: {
      endpoint: "/api/openstrat/status",
      package: "@openstrat/market-data",
      side_effects: "none"
    }
  };
}

function assetCtx(
  markPx: string,
  prevDayPx: string,
  dayNtlVlm: string,
  openInterest: string,
  funding: string
) {
  return {
    dayNtlVlm,
    funding,
    impactPxs: ["0.0", "0.0"],
    markPx,
    midPx: markPx,
    openInterest,
    oraclePx: prevDayPx,
    premium: "0.0",
    prevDayPx
  };
}
