import { describe, expect, it } from "vitest";
import type {
  HyperliquidAllPerpMetasResponse,
  HyperliquidCandleSnapshotResponse,
  HyperliquidFundingHistoryResponse,
  HyperliquidL2BookResponse,
  HyperliquidMetaAndAssetCtxsResponse,
  HyperliquidPerpConciseAnnotationsResponse,
  HyperliquidPerpDexLimitsResponse,
  HyperliquidPerpDexsResponse,
  HyperliquidPerpDexStatusResponse,
  HyperliquidPerpsAtOpenInterestCapResponse,
  HyperliquidPredictedFundingsResponse
} from "@openstrat/market-data";
import { getPerpMarketDetail, getPerpsScreener } from "./market-analytics";

const now = new Date("2026-07-02T00:00:00.000Z");

const nativeMetaAndAssetCtxs: HyperliquidMetaAndAssetCtxsResponse = [
  {
    marginTables: [[50, { description: "50x" }]],
    universe: [{ maxLeverage: 50, name: "BTC", szDecimals: 5 }]
  },
  [
    {
      dayNtlVlm: "1200000000.0",
      funding: "0.00005",
      impactPxs: ["59990.0", "60010.0"],
      markPx: "60000.0",
      midPx: "60000.0",
      openInterest: "20000.0",
      oraclePx: "59950.0",
      premium: "0.0002",
      prevDayPx: "58000.0"
    }
  ]
];

const hip3MetaAndAssetCtxs: HyperliquidMetaAndAssetCtxsResponse = [
  {
    marginTables: [[10, { description: "10x" }]],
    universe: [
      {
        marginMode: "strictIsolated",
        maxLeverage: 10,
        name: "xyz:TSLA",
        onlyIsolated: true,
        szDecimals: 3
      }
    ]
  },
  [
    {
      dayNtlVlm: "400000.0",
      funding: "0.0003",
      impactPxs: ["249.0", "253.0"],
      markPx: "251.0",
      midPx: "251.0",
      openInterest: "900.0",
      oraclePx: "250.0",
      premium: "0.001",
      prevDayPx: "260.0"
    }
  ]
];

const allPerpMetas: HyperliquidAllPerpMetasResponse = [
  nativeMetaAndAssetCtxs[0],
  hip3MetaAndAssetCtxs[0]
];

const candleSnapshot: HyperliquidCandleSnapshotResponse = [
  {
    T: 1782944099999,
    c: "60050.0",
    h: "60100.0",
    i: "15m",
    l: "59900.0",
    n: 42,
    o: "60000.0",
    s: "BTC",
    t: 1782943200000,
    v: "10.0"
  },
  {
    T: 1782944999999,
    c: "60200.0",
    h: "60300.0",
    i: "15m",
    l: "60020.0",
    n: 61,
    o: "60050.0",
    s: "BTC",
    t: 1782944100000,
    v: "12.0"
  }
];

const fundingHistory: HyperliquidFundingHistoryResponse = [
  {
    coin: "BTC",
    fundingRate: "0.00005",
    premium: "0.0002",
    time: 1782943200000
  }
];

const l2Book: HyperliquidL2BookResponse = {
  coin: "BTC",
  levels: [
    [
      { n: 4, px: "59990.0", sz: "2.0" },
      { n: 2, px: "59980.0", sz: "1.0" }
    ],
    [
      { n: 3, px: "60010.0", sz: "1.5" },
      { n: 2, px: "60020.0", sz: "1.0" }
    ]
  ],
  time: 1782943200000
};

const conciseAnnotations: HyperliquidPerpConciseAnnotationsResponse = [
  ["BTC", { category: "majors", keywords: ["store-of-value"] }],
  ["xyz:TSLA", { category: "equities", keywords: ["hip-3"] }]
];

const dexLimits: HyperliquidPerpDexLimitsResponse = {
  coinToOiCap: [["xyz:TSLA", "1000.0"]],
  maxTransferNtl: "1000000.0",
  oiSzCapPerPerp: "100000.0",
  totalOiCap: "1000000.0"
};

const perpDexs: HyperliquidPerpDexsResponse = [
  null,
  {
    assetToFundingMultiplier: [["xyz:TSLA", "2.0"]],
    assetToStreamingOiCap: [["xyz:TSLA", "1000.0"]],
    deployer: "0x0000000000000000000000000000000000000001",
    fullName: "XYZ perps",
    name: "xyz"
  }
];

const dexStatus: HyperliquidPerpDexStatusResponse = {
  totalNetDeposit: "100000.0"
};

const perpsAtOpenInterestCap: HyperliquidPerpsAtOpenInterestCapResponse = ["xyz:TSLA"];

const predictedFundings: HyperliquidPredictedFundingsResponse = [
  ["BTC", [["HlPerp", { fundingRate: "0.00005", nextFundingTime: 1782946800000 }]]]
];

const testClient = {
  allPerpMetas: async () => allPerpMetas,
  candleSnapshot: async () => candleSnapshot,
  fundingHistory: async () => fundingHistory,
  metaAndAssetCtxs: async (dex?: string) =>
    dex === "xyz" ? hip3MetaAndAssetCtxs : nativeMetaAndAssetCtxs,
  l2Book: async () => l2Book,
  perpConciseAnnotations: async () => conciseAnnotations,
  perpDexLimits: async () => dexLimits,
  perpDexs: async () => perpDexs,
  perpDexStatus: async () => dexStatus,
  perpsAtOpenInterestCap: async () => perpsAtOpenInterestCap,
  predictedFundings: async () => predictedFundings
};

describe("Hyperliquid perps analytics", () => {
  it("maps live info responses into sorted screener rows and dex health", async () => {
    const screener = await getPerpsScreener({ client: testClient, now });

    expect(screener.source_status).toBe("live");
    expect(screener.rows.map((row) => row.market_key)).toEqual(["BTC", "xyz:TSLA"]);
    expect(screener.rows[0]).toMatchObject({
      category: "majors",
      change_24h: 0.034482758620689655,
      dex: "Hyperliquid",
      max_leverage: 50,
      open_interest_notional: 1_200_000_000,
      price: 60_000,
      volume_24h: 1_200_000_000
    });
    expect(screener.rows[0]?.annualized_funding).toBeCloseTo(0.438);
    expect(screener.rows[1]).toMatchObject({
      at_oi_cap: true,
      category: "equities",
      dex: "xyz",
      funding_multiplier: 2,
      market_key: "xyz:TSLA",
      open_interest_cap: 1000,
      open_interest_cap_utilization: 0.9
    });
    expect(screener.dex_health[0]).toMatchObject({
      active_markets: 1,
      dex: "Hyperliquid",
      market_count: 1
    });
    expect(screener.dex_health[1]).toMatchObject({
      at_oi_cap: ["xyz:TSLA"],
      dex: "xyz",
      funding_multipliers: 1,
      market_count: 1
    });
  });

  it("builds a market detail report with funding, candles, depth, and readiness", async () => {
    const detail = await getPerpMarketDetail({
      client: testClient,
      marketKey: "BTC",
      now
    });

    expect(detail.market.market_key).toBe("BTC");
    expect(detail.candles).toHaveLength(2);
    expect(detail.funding_history).toEqual([
      { time: "2026-07-01T22:00:00.000Z", value: 0.00005 }
    ]);
    expect(detail.depth).toMatchObject({
      best_ask: 60010,
      best_bid: 59990,
      spread: 20
    });
    expect(detail.readiness.checks.map((check) => check.label)).toEqual([
      "Liquidity",
      "Funding",
      "Depth",
      "OI cap",
      "Volatility"
    ]);
  });
});
