import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./env";
import { getServerEnv } from "./server-env";

let browserClient: SupabaseClient | undefined;
let serverAdminClient: SupabaseClient | undefined;

export function createOpenStratBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      publicEnv.supabaseUrl,
      publicEnv.supabasePublishableKey
    );
  }
  return browserClient;
}

export function createOpenStratServerSupabaseClient(): SupabaseClient {
  if (!serverAdminClient) {
    const env = getServerEnv();
    serverAdminClient = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return serverAdminClient;
}
