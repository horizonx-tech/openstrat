import type { StrategyRecord } from "@/types/openstrat";
import { ApiError } from "./http";
import { createOpenStratServerSupabaseClient } from "./supabase";
import {
  buildStrategyInsert,
  type StrategyCreateInput,
  StrategyCreateInputSchema
} from "./strategy-input";

export { StrategyCreateInputSchema };

export async function listStrategies(privyDid: string): Promise<StrategyRecord[]> {
  const supabase = createOpenStratServerSupabaseClient();
  const { data, error } = await supabase
    .from("openstrat_strategies")
    .select("*")
    .eq("owner_privy_did", privyDid)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(
      500,
      "SUPABASE_STRATEGY_LIST_FAILED",
      `Could not list OpenStrat strategies: ${error.message}`
    );
  }
  return (data ?? []) as StrategyRecord[];
}

export async function getStrategy(
  privyDid: string,
  strategyId: string
): Promise<StrategyRecord> {
  const supabase = createOpenStratServerSupabaseClient();
  const { data, error } = await supabase
    .from("openstrat_strategies")
    .select("*")
    .eq("owner_privy_did", privyDid)
    .eq("id", strategyId)
    .single();

  if (error) {
    throw new ApiError(
      error.code === "PGRST116" ? 404 : 500,
      "SUPABASE_STRATEGY_READ_FAILED",
      `Could not read OpenStrat strategy: ${error.message}`
    );
  }
  return data as StrategyRecord;
}

export async function createStrategy(
  privyDid: string,
  input: StrategyCreateInput
): Promise<StrategyRecord> {
  const now = new Date().toISOString();
  const supabase = createOpenStratServerSupabaseClient();
  const { data, error } = await supabase
    .from("openstrat_strategies")
    .insert(buildStrategyInsert(privyDid, input, now))
    .select("*")
    .single();

  if (error) {
    throw new ApiError(
      500,
      "SUPABASE_STRATEGY_CREATE_FAILED",
      `Could not create OpenStrat strategy: ${error.message}`
    );
  }
  return data as StrategyRecord;
}
