import {
  HyperliquidInfoClient,
  type HyperliquidAllPerpMetasResponse,
  type HyperliquidCandleSnapshotResponse,
  type HyperliquidFundingHistoryResponse,
  type HyperliquidL2BookResponse,
  type HyperliquidMetaAndAssetCtxsResponse,
  type HyperliquidMetaResponse,
  type HyperliquidPerpConciseAnnotationsResponse,
  type HyperliquidPerpDexLimitsResponse,
  type HyperliquidPerpDexsResponse,
  type HyperliquidPerpDexStatusResponse,
  type HyperliquidPerpsAtOpenInterestCapResponse,
  type HyperliquidPredictedFundingsResponse
} from "@openstrat/market-data";
import type {
  MarketCandlePoint,
  MarketDepthSummary,
  MarketSeriesPoint,
  PerpDexHealth,
  PerpMarketDetailResponse,
  PerpMarketRow,
  PerpsScreenerResponse,
  StrategyReadinessCheck
} from "@/types/openstrat";

const SCREENER_CACHE_MS = 20_000;
const DETAIL_CACHE_MS = 20_000;
const MAJORS = new Set(["BTC", "ETH", "SOL", "HYPE"]);

type MaybePromise<T> = T | Promise<T>;

interface HyperliquidAnalyticsClient {
  allPerpMetas?(): MaybePromise<HyperliquidAllPerpMetasResponse>;
  candleSnapshot(request: {
    coin: string;
    endTime?: number;
    interval: string;
    startTime: number;
  }): MaybePromise<HyperliquidCandleSnapshotResponse>;
  fundingHistory(request: {
    coin: string;
    endTime?: number;
    startTime: number;
  }): MaybePromise<HyperliquidFundingHistoryResponse>;
  l2Book(request: { coin: string }): MaybePromise<HyperliquidL2BookResponse>;
  metaAndAssetCtxs(dex?: string): MaybePromise<HyperliquidMetaAndAssetCtxsResponse>;
  perpsAtOpenInterestCap?(
    dex?: string
  ): MaybePromise<HyperliquidPerpsAtOpenInterestCapResponse>;
  perpConciseAnnotations?(): MaybePromise<HyperliquidPerpConciseAnnotationsResponse>;
  perpDexLimits?(dex: string): MaybePromise<HyperliquidPerpDexLimitsResponse>;
  perpDexs?(): MaybePromise<HyperliquidPerpDexsResponse>;
  perpDexStatus?(dex?: string): MaybePromise<HyperliquidPerpDexStatusResponse>;
  predictedFundings?(): MaybePromise<HyperliquidPredictedFundingsResponse>;
}

interface ScreenerOptions {
  client?: HyperliquidAnalyticsClient;
  force?: boolean;
  now?: Date;
}

interface DetailOptions extends ScreenerOptions {
  marketKey: string;
}

let screenerCache:
  | {
      data: PerpsScreenerResponse;
      expiresAt: number;
    }
  | undefined;

const detailCache = new Map<
  string,
  {
    data: PerpMarketDetailResponse;
    expiresAt: number;
  }
>();

export async function getPerpsScreener(
  options: ScreenerOptions = {}
): Promise<PerpsScreenerResponse> {
  const now = options.now ?? new Date();
  const cacheKeyEligible = !options.client && options.force !== true;
  if (cacheKeyEligible && screenerCache && screenerCache.expiresAt > now.getTime()) {
    return screenerCache.data;
  }

  const client = options.client ?? new HyperliquidInfoClient();
  const data = await buildPerpsScreener(client, now);

  if (cacheKeyEligible) {
    screenerCache = {
      data,
      expiresAt: now.getTime() + SCREENER_CACHE_MS
    };
  }

  return data;
}

export async function getPerpMarketDetail(
  options: DetailOptions
): Promise<PerpMarketDetailResponse> {
  const now = options.now ?? new Date();
  const cacheKey = decodeURIComponent(options.marketKey);
  const cacheKeyEligible = !options.client && options.force !== true;
  const cached = detailCache.get(cacheKey);
  if (cacheKeyEligible && cached && cached.expiresAt > now.getTime()) {
    return cached.data;
  }

  const client = options.client ?? new HyperliquidInfoClient();
  const screener = await getPerpsScreener({
    client,
    force: true,
    now
  });
  const market = screener.rows.find((row) => row.market_key === cacheKey);
  if (!market) {
    throw new Error(`Unknown Hyperliquid perp market ${cacheKey}`);
  }

  const endTime = now.getTime();
  const candleStart = endTime - 24 * 60 * 60 * 1000;
  const fundingStart = endTime - 7 * 24 * 60 * 60 * 1000;
  const [candlesRaw, fundingRaw, l2BookRaw] = await Promise.all([
    optionalRead(() =>
      client.candleSnapshot({
        coin: market.market_key,
        endTime,
        interval: "15m",
        startTime: candleStart
      })
    ),
    optionalRead(() =>
      client.fundingHistory({
        coin: market.market_key,
        endTime,
        startTime: fundingStart
      })
    ),
    optionalRead(() => client.l2Book({ coin: market.market_key }))
  ]);

  const candles = mapCandles(candlesRaw ?? []);
  const fundingHistory = mapFundingHistory(fundingRaw ?? []);
  const depth = mapDepth(l2BookRaw, market.price);
  const realizedVolatility = realizedVolatilityFromCandles(candles);
  const readiness = buildReadiness(market, depth, realizedVolatility);
  const detail: PerpMarketDetailResponse = {
    candles,
    depth,
    funding_history: fundingHistory,
    generated_at: now.toISOString(),
    market,
    realized_volatility: realizedVolatility,
    readiness
  };

  if (cacheKeyEligible) {
    detailCache.set(cacheKey, {
      data: detail,
      expiresAt: now.getTime() + DETAIL_CACHE_MS
    });
  }

  return detail;
}

async function buildPerpsScreener(
  client: HyperliquidAnalyticsClient,
  now: Date
): Promise<PerpsScreenerResponse> {
  const [
    allMetas,
    defaultMetaAndCtxs,
    dexes,
    annotations,
    predictedFundings,
    defaultOiCaps,
    deployAuction
  ] = await Promise.all([
    optionalRead(() => client.allPerpMetas?.()),
    optionalRead(() => client.metaAndAssetCtxs()),
    optionalRead(() => client.perpDexs?.()),
    optionalRead(() => client.perpConciseAnnotations?.()),
    optionalRead(() => client.predictedFundings?.()),
    optionalRead(() => client.perpsAtOpenInterestCap?.()),
    optionalRead(() => client.perpDexStatus?.(""))
  ]);

  const metas =
    allMetas && allMetas.length > 0
      ? allMetas
      : defaultMetaAndCtxs
        ? [defaultMetaAndCtxs[0]]
        : [];
  const annotationMap = new Map(
    (annotations ?? []).map(([coin, value]) => [coin, value])
  );
  const predictedFundingMap = predictedFundingByCoin(predictedFundings ?? []);
  const dexRecords = dexes ?? [];
  const dexNames = dexNamesForMetas(metas, dexRecords);
  const nonDefaultDexes = dexNames.filter((dex) => dex !== "");
  const [dexMetaAndCtxEntries, dexLimitEntries, dexStatusEntries, dexOiCapEntries] =
    await Promise.all([
      Promise.all(
        nonDefaultDexes.map(
          async (dex) =>
            [dex, await optionalRead(() => client.metaAndAssetCtxs(dex))] as const
        )
      ),
      Promise.all(
        nonDefaultDexes.map(
          async (dex) =>
            [dex, await optionalRead(() => client.perpDexLimits?.(dex))] as const
        )
      ),
      Promise.all(
        dexNames.map(
          async (dex) =>
            [dex, await optionalRead(() => client.perpDexStatus?.(dex))] as const
        )
      ),
      Promise.all(
        nonDefaultDexes.map(
          async (dex) =>
            [
              dex,
              await optionalRead(() => client.perpsAtOpenInterestCap?.(dex))
            ] as const
        )
      )
    ]);
  const dexMetaAndCtxs = new Map(dexMetaAndCtxEntries);
  const dexLimits = new Map(dexLimitEntries);
  const dexStatuses = new Map(dexStatusEntries);
  const dexOiCaps = new Map<string, Set<string>>(
    dexOiCapEntries.map(([dex, values]) => [dex, new Set(values ?? [])])
  );
  dexOiCaps.set("", new Set(defaultOiCaps ?? []));
  const metaEntries: Array<{
    ctxs: HyperliquidMetaAndAssetCtxsResponse[1];
    meta: HyperliquidMetaResponse;
  }> = metas.map((meta, dexIndex) => {
    const dex = dexNames[dexIndex] ?? "";
    const metaAndCtxs = dex === "" ? defaultMetaAndCtxs : dexMetaAndCtxs.get(dex);
    return {
      ctxs: metaAndCtxs?.[1] ?? [],
      meta
    };
  });

  const rows: PerpMarketRow[] = [];
  const dexHealth: PerpDexHealth[] = [];

  metaEntries.forEach(({ ctxs, meta }, dexIndex) => {
    const dex = dexNames[dexIndex] ?? "";
    const dexRecord = dexRecords[dexIndex] ?? null;
    const limit = dexLimits.get(dex);
    const status = dexStatuses.get(dex) ?? (dex === "" ? deployAuction : undefined);
    const oiCapSet = dexOiCaps.get(dex) ?? new Set<string>();
    const capByCoin = new Map(
      limit?.coinToOiCap ?? dexRecord?.assetToStreamingOiCap ?? []
    );
    const fundingMultiplierByCoin = new Map(dexRecord?.assetToFundingMultiplier ?? []);
    const dexRows = meta.universe.map((asset, assetIndex) => {
      const ctx = ctxs[assetIndex];
      const price = numeric(ctx?.markPx);
      const prevDayPrice = numeric(ctx?.prevDayPx);
      const oraclePrice = numeric(ctx?.oraclePx);
      const midPrice = ctx?.midPx === null ? null : numeric(ctx?.midPx);
      const openInterestBase = numeric(ctx?.openInterest);
      const volume24h = numeric(ctx?.dayNtlVlm);
      const fundingRate = numeric(ctx?.funding);
      const openInterestCap = nullableNumeric(capByCoin.get(asset.name));
      const impactSpread = impactSpreadRatio(ctx?.impactPxs ?? null, price);
      const annotation = annotationMap.get(asset.name);
      const predicted = predictedFundingMap.get(asset.name);
      const atOiCap = oiCapSet.has(asset.name);
      const row: PerpMarketRow = {
        annualized_funding: fundingRate * 24 * 365,
        at_oi_cap: atOiCap,
        category:
          annotation?.category ??
          predicted?.venue ??
          (dex === "" && MAJORS.has(asset.name) ? "majors" : dex ? "hip-3" : "perps"),
        change_24h: prevDayPrice > 0 ? (price - prevDayPrice) / prevDayPrice : 0,
        dex: dex === "" ? "Hyperliquid" : dex,
        dex_index: dexIndex,
        display_symbol: asset.name.includes(":")
          ? (asset.name.split(":").pop() ?? asset.name)
          : asset.name,
        funding_multiplier: nullableNumeric(fundingMultiplierByCoin.get(asset.name)),
        funding_rate: fundingRate,
        impact_spread: impactSpread,
        liquidity_score: liquidityScore(volume24h, openInterestBase * price),
        margin_mode: asset.marginMode ?? (asset.onlyIsolated ? "isolated" : "cross"),
        market_key: asset.name,
        max_leverage: asset.maxLeverage,
        mid_price: midPrice,
        open_interest_base: openInterestBase,
        open_interest_cap: openInterestCap,
        open_interest_cap_utilization:
          openInterestCap && openInterestCap > 0
            ? openInterestBase / openInterestCap
            : null,
        open_interest_notional: openInterestBase * price,
        oracle_divergence: oraclePrice > 0 ? (price - oraclePrice) / oraclePrice : 0,
        oracle_price: oraclePrice,
        premium: ctx?.premium === null ? null : nullableNumeric(ctx?.premium),
        price,
        status: marketStatus(
          asset.isDelisted === true,
          volume24h,
          openInterestBase,
          atOiCap
        ),
        volume_24h: volume24h
      };
      rows.push(row);
      return row;
    });

    const totalOi = dexRows.reduce(
      (total, row) => total + row.open_interest_notional,
      0
    );
    const totalCap = nullableNumeric(limit?.totalOiCap);
    dexHealth.push({
      active_markets: dexRows.filter((row) => row.status === "active").length,
      at_oi_cap: Array.from(oiCapSet),
      deployer: dexRecord?.deployer ?? null,
      dex: dex === "" ? "Hyperliquid" : dex,
      funding_multipliers: fundingMultiplierByCoin.size,
      market_count: dexRows.length,
      max_transfer_notional: nullableNumeric(limit?.maxTransferNtl),
      open_interest_cap: totalCap,
      open_interest_cap_utilization:
        totalCap && totalCap > 0 ? totalOi / totalCap : null,
      total_net_deposit: nullableNumeric(status?.totalNetDeposit),
      total_open_interest_notional: totalOi,
      total_volume_24h: dexRows.reduce((total, row) => total + row.volume_24h, 0)
    });
  });

  rows.sort((a, b) => b.volume_24h - a.volume_24h);

  return {
    dex_health: dexHealth,
    generated_at: now.toISOString(),
    rows,
    source: "hyperliquid",
    source_status: metas.length > 0 ? "live" : "fallback"
  };
}

async function optionalRead<T>(
  read: () => MaybePromise<T | undefined>
): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

function dexNamesForMetas(
  metas: HyperliquidAllPerpMetasResponse,
  dexes: HyperliquidPerpDexsResponse
): string[] {
  return metas.map((meta, index) => {
    if (index === 0) {
      return "";
    }
    const dexRecord = dexes[index];
    if (dexRecord?.name) {
      return dexRecord.name;
    }
    const firstName = meta.universe[0]?.name;
    return firstName?.includes(":") ? (firstName.split(":")[0] ?? "") : `dex-${index}`;
  });
}

function predictedFundingByCoin(response: HyperliquidPredictedFundingsResponse) {
  const map = new Map<string, { fundingRate: number; venue: string }>();
  for (const [coin, venues] of response) {
    const hlVenue =
      venues.find(
        ([venue, details]) => details && venue.toLowerCase().includes("hl")
      ) ?? venues.find(([, details]) => details !== null);
    if (hlVenue?.[1]) {
      map.set(coin, {
        fundingRate: numeric(hlVenue[1].fundingRate),
        venue: hlVenue[0]
      });
    }
  }
  return map;
}

function mapCandles(raw: HyperliquidCandleSnapshotResponse): MarketCandlePoint[] {
  return raw.map((candle) => ({
    close: numeric(candle.c),
    high: numeric(candle.h),
    low: numeric(candle.l),
    open: numeric(candle.o),
    time: new Date(candle.t).toISOString(),
    value: numeric(candle.c),
    volume: numeric(candle.v)
  }));
}

function mapFundingHistory(
  raw: HyperliquidFundingHistoryResponse
): MarketSeriesPoint[] {
  return raw.map((item) => ({
    time: new Date(item.time).toISOString(),
    value: numeric(item.fundingRate)
  }));
}

function mapDepth(
  raw: HyperliquidL2BookResponse | undefined,
  fallbackPrice: number
): MarketDepthSummary | null {
  if (!raw) {
    return null;
  }
  const bids = raw.levels[0];
  const asks = raw.levels[1];
  const bestBid = nullableNumeric(bids[0]?.px);
  const bestAsk = nullableNumeric(asks[0]?.px);
  const bidNotional = bids.reduce(
    (total, level) => total + numeric(level.px) * numeric(level.sz),
    0
  );
  const askNotional = asks.reduce(
    (total, level) => total + numeric(level.px) * numeric(level.sz),
    0
  );
  const totalDepth = bidNotional + askNotional;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  return {
    ask_notional: askNotional,
    best_ask: bestAsk,
    best_bid: bestBid,
    bid_notional: bidNotional,
    imbalance: totalDepth > 0 ? (bidNotional - askNotional) / totalDepth : 0,
    spread,
    spread_bps:
      spread !== null && fallbackPrice > 0 ? (spread / fallbackPrice) * 10_000 : null
  };
}

function buildReadiness(
  market: PerpMarketRow,
  depth: MarketDepthSummary | null,
  realizedVolatility: number | null
): PerpMarketDetailResponse["readiness"] {
  const checks: StrategyReadinessCheck[] = [
    {
      label: "Liquidity",
      ok: market.volume_24h >= 5_000_000,
      value: compactUsd(market.volume_24h)
    },
    {
      label: "Funding",
      ok: Math.abs(market.annualized_funding) <= 0.5,
      value: percent(market.annualized_funding)
    },
    {
      label: "Depth",
      ok: depth?.spread_bps === null ? false : (depth?.spread_bps ?? 999) <= 25,
      value:
        depth?.spread_bps === null
          ? "n/a"
          : `${(depth?.spread_bps ?? 0).toFixed(1)} bps`
    },
    {
      label: "OI cap",
      ok: !market.at_oi_cap && (market.open_interest_cap_utilization ?? 0) < 0.9,
      value:
        market.open_interest_cap_utilization === null
          ? "uncapped"
          : percent(market.open_interest_cap_utilization)
    },
    {
      label: "Volatility",
      ok: realizedVolatility === null ? true : realizedVolatility >= 0.2,
      value: realizedVolatility === null ? "pending" : percent(realizedVolatility)
    }
  ];
  const score = checks.filter((check) => check.ok).length / checks.length;
  return {
    checks,
    score,
    summary:
      score >= 0.8
        ? "Research-ready market with enough liquidity and manageable structural risk."
        : score >= 0.55
          ? "Usable for research, but strategy prompts should account for the weak checks."
          : "High-friction market. Treat signals as exploratory until liquidity and cap risk improve."
  };
}

function realizedVolatilityFromCandles(candles: MarketCandlePoint[]): number | null {
  if (candles.length < 2) {
    return null;
  }
  const returns: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (previous && current && previous.close > 0 && current.close > 0) {
      returns.push(Math.log(current.close / previous.close));
    }
  }
  if (returns.length === 0) {
    return null;
  }
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365 * 24 * 4);
}

function marketStatus(
  isDelisted: boolean,
  volume24h: number,
  openInterestBase: number,
  atOiCap: boolean
): string {
  if (isDelisted) {
    return "delisted";
  }
  if (atOiCap) {
    return "oi_cap";
  }
  if (volume24h <= 0 && openInterestBase <= 0) {
    return "inactive";
  }
  if (volume24h < 100_000) {
    return "thin";
  }
  return "active";
}

function liquidityScore(volume24h: number, openInterestNotional: number): number {
  const volumeScore = Math.min(1, Math.log10(Math.max(volume24h, 1)) / 9);
  const oiScore = Math.min(1, Math.log10(Math.max(openInterestNotional, 1)) / 9);
  return Math.max(0, Math.min(1, (volumeScore * 0.65 + oiScore * 0.35) * 1.2));
}

function impactSpreadRatio(values: string[] | null, price: number): number | null {
  if (!values || values.length < 2 || price <= 0) {
    return null;
  }
  const bid = numeric(values[0]);
  const ask = numeric(values[1]);
  return ask >= bid ? (ask - bid) / price : null;
}

function nullableNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numeric(value: string | number | null | undefined): number {
  return nullableNumeric(value) ?? 0;
}

function compactUsd(value: number): string {
  return `$${Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(value)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
