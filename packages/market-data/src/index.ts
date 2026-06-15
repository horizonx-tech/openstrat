import type {
  Candle,
  CandleInterval,
  MarketDatum,
  MarketFreshnessPolicy,
  MarketRawPayloadRef,
  MarketRegistryEntry,
  MarketSourceProvenance,
  NormalizedMarketDataRef,
  OrderbookSnapshot
} from "@openstrat/domain";

export const marketDataPackageName = "@openstrat/market-data" as const;

export interface MarketDataQuery {
  canonical_symbol: string;
  source?: string;
  venue?: string;
}

export interface CandleQuery extends MarketDataQuery {
  interval: CandleInterval;
  start_at: string;
  end_at: string;
}

export interface OrderbookQuery extends MarketDataQuery {
  depth: number;
}

export interface MarketDataSnapshotContext {
  dataset_ref?: string;
  registry_ref?: string;
  latest_price_ref?: string;
  raw_refs?: readonly MarketRawPayloadRef[];
  normalized_refs?: readonly NormalizedMarketDataRef[];
  freshness?: MarketFreshnessPolicy;
  source_provenance?: MarketSourceProvenance;
}

export interface MarketDataReader {
  getMarket(canonicalSymbol: string): Promise<MarketRegistryEntry | undefined>;
  getLatestPrice(query: MarketDataQuery): Promise<MarketDatum>;
  getLatestDataset?(
    query: MarketDataQuery
  ): Promise<MarketDataSnapshotContext | undefined>;
  getCandles(query: CandleQuery): Promise<Candle[]>;
  getOrderbookSnapshot(query: OrderbookQuery): Promise<OrderbookSnapshot>;
}

export * from "./datasets.js";
export * from "./hyperliquid/index.js";
