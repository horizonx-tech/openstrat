import { z } from "zod";

export const StrategyCreateInputSchema = z.object({
  leverage: z.number().int().min(1).max(100).nullable().default(null),
  market: z.string().min(1).max(32).default("BTC-PERP"),
  prompt: z.string().min(1).max(4000),
  risk_profile: z.string().min(1).max(64).default("high-volatility"),
  scan_cadence: z.string().min(1).max(64).default("Every 15 minutes"),
  schedule: z.string().min(1).max(64).default("Paper review only"),
  timeframe: z.string().min(1).max(32).default("15m")
});

export type StrategyCreateInput = z.infer<typeof StrategyCreateInputSchema>;

export function buildStrategyInsert(
  ownerPrivyDid: string,
  input: StrategyCreateInput,
  updatedAt: string
) {
  const parsed = StrategyCreateInputSchema.parse(input);
  return {
    deployment_status: "not_configured",
    factors: inferFactors(parsed.prompt),
    leverage: parsed.leverage,
    market: parsed.market,
    owner_privy_did: ownerPrivyDid,
    prompt: parsed.prompt,
    risk_profile: parsed.risk_profile,
    scan_cadence: parsed.scan_cadence,
    schedule: parsed.schedule,
    status: "queued",
    summary:
      "Strategy request captured. Managed research and backtesting are not enabled in this shell.",
    timeframe: parsed.timeframe,
    title: strategyTitle(parsed.market, parsed.timeframe, parsed.prompt),
    updated_at: updatedAt
  };
}

function strategyTitle(market: string, timeframe: string, prompt: string): string {
  const compactPrompt = prompt.trim().split(/\s+/).slice(0, 7).join(" ");
  return `${market} ${timeframe} - ${compactPrompt}`;
}

function inferFactors(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const factors = [
    lower.includes("volatility") ? "Volatility expansion" : undefined,
    lower.includes("funding") ? "Funding pressure" : undefined,
    lower.includes("momentum") ? "Momentum follow-through" : undefined,
    lower.includes("order") || lower.includes("liquidity")
      ? "Orderbook/liquidity imbalance"
      : undefined,
    lower.includes("leverage") ? "Leverage-aware risk envelope" : undefined
  ].filter((factor): factor is string => factor !== undefined);

  return factors.length > 0
    ? factors
    : ["Market regime", "Liquidity quality", "Risk envelope"];
}
