export interface Profile {
  created_at: string;
  email: string | null;
  id: string;
  last_seen_at: string;
  privy_did: string;
  updated_at: string;
  wallet_address: string | null;
}

export type StrategyStatus = "draft" | "queued" | "research" | "backtest" | "ready";

export interface StrategyRecord {
  created_at: string;
  deployment_status: string;
  factors: string[];
  id: string;
  leverage: number | null;
  market: string;
  owner_privy_did: string;
  prompt: string;
  risk_profile: string;
  scan_cadence: string;
  schedule: string;
  status: StrategyStatus;
  summary: string;
  timeframe: string;
  title: string;
  updated_at: string;
}

export interface MarketSignal {
  change_24h: number;
  funding_rate: number;
  liquidity_score: number;
  max_leverage: number;
  open_interest: number;
  price: number;
  status: string;
  symbol: string;
}

export type AgentRuntimeAuthMode = "api_key" | "chatgpt" | "credits";

export type AgentRuntimeConnectionState =
  "available" | "connected" | "planned" | "requires_bridge";

export interface AgentRuntimeModel {
  context_window?: number;
  enabled: boolean;
  id: string;
  label: string;
  route: string;
}

export interface AgentRuntimeProvider {
  auth_modes: AgentRuntimeAuthMode[];
  connection_detail: string;
  connection_state: AgentRuntimeConnectionState;
  id: string;
  label: string;
  models: AgentRuntimeModel[];
  note: string;
  primary_action: string;
  primary_action_enabled: boolean;
  status_label: string;
}

export interface AgentRuntimeStatus {
  boundary: {
    app_auth: string;
    model_auth: string;
    secret_material_policy: string;
  };
  default_model_id: string;
  providers: AgentRuntimeProvider[];
  runtime_enabled: boolean;
  selected_provider_id: string;
}

export type PerpScreenerFilter =
  | "all"
  | "majors"
  | "hip3"
  | "high-funding"
  | "high-oi"
  | "oi-cap-risk"
  | "low-liquidity"
  | "watchlist";

export interface PerpMarketRow {
  annualized_funding: number;
  at_oi_cap: boolean;
  category: string;
  change_24h: number;
  dex: string;
  dex_index: number;
  display_symbol: string;
  funding_multiplier: number | null;
  funding_rate: number;
  impact_spread: number | null;
  liquidity_score: number;
  margin_mode: string;
  market_key: string;
  max_leverage: number;
  mid_price: number | null;
  open_interest_base: number;
  open_interest_cap: number | null;
  open_interest_cap_utilization: number | null;
  open_interest_notional: number;
  oracle_divergence: number;
  oracle_price: number;
  premium: number | null;
  price: number;
  status: string;
  volume_24h: number;
}

export interface PerpDexHealth {
  active_markets: number;
  at_oi_cap: string[];
  dex: string;
  deployer: string | null;
  funding_multipliers: number;
  market_count: number;
  max_transfer_notional: number | null;
  open_interest_cap: number | null;
  open_interest_cap_utilization: number | null;
  total_net_deposit: number | null;
  total_open_interest_notional: number;
  total_volume_24h: number;
}

export interface PerpsScreenerResponse {
  dex_health: PerpDexHealth[];
  generated_at: string;
  rows: PerpMarketRow[];
  source: "hyperliquid";
  source_status: "live" | "fallback";
}

export interface MarketSeriesPoint {
  time: string;
  value: number;
}

export interface MarketCandlePoint extends MarketSeriesPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
}

export interface MarketDepthSummary {
  ask_notional: number;
  best_ask: number | null;
  best_bid: number | null;
  bid_notional: number;
  imbalance: number;
  spread: number | null;
  spread_bps: number | null;
}

export interface StrategyReadinessCheck {
  label: string;
  ok: boolean;
  value: string;
}

export interface PerpMarketDetailResponse {
  candles: MarketCandlePoint[];
  depth: MarketDepthSummary | null;
  funding_history: MarketSeriesPoint[];
  generated_at: string;
  market: PerpMarketRow;
  realized_volatility: number | null;
  readiness: {
    checks: StrategyReadinessCheck[];
    score: number;
    summary: string;
  };
}
