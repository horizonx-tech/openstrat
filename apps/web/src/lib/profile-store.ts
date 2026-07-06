import type { Profile } from "@/types/openstrat";
import { ApiError } from "./http";
import { createOpenStratServerSupabaseClient } from "./supabase";

interface UpsertProfileInput {
  email?: string;
  linkedAccounts: unknown[];
  privyDid: string;
  walletAddress?: string;
}

export async function upsertProfile(input: UpsertProfileInput): Promise<Profile> {
  const now = new Date().toISOString();
  const supabase = createOpenStratServerSupabaseClient();
  const { data, error } = await supabase
    .from("openstrat_profiles")
    .upsert(
      {
        email: input.email ?? null,
        last_seen_at: now,
        linked_accounts: input.linkedAccounts,
        privy_did: input.privyDid,
        updated_at: now,
        wallet_address: input.walletAddress ?? null
      },
      { onConflict: "privy_did" }
    )
    .select("created_at,email,id,last_seen_at,privy_did,updated_at,wallet_address")
    .single();

  if (error) {
    throw new ApiError(
      500,
      "SUPABASE_PROFILE_UPSERT_FAILED",
      `Could not upsert OpenStrat profile: ${error.message}`
    );
  }
  return data as Profile;
}
