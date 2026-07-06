import "server-only";

import nextEnv from "@next/env";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const { loadEnvConfig } = nextEnv;
let workspaceEnvLoaded = false;

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

function workspaceCandidates(): string[] {
  const cwd = process.cwd();
  return Array.from(new Set([cwd, resolve(cwd, "../..")]));
}

export function loadWorkspaceEnv(): void {
  if (workspaceEnvLoaded) {
    return;
  }

  for (const candidate of workspaceCandidates()) {
    if (
      existsSync(resolve(candidate, ".env")) ||
      existsSync(resolve(candidate, ".env.local"))
    ) {
      loadEnvConfig(candidate);
    }
  }

  workspaceEnvLoaded = true;
}

export function readServerEnv(...keys: string[]): string {
  loadWorkspaceEnv();
  return firstNonEmpty(...keys.map((key) => process.env[key]));
}

export function requireServerEnv(...keys: string[]): string {
  const value = readServerEnv(...keys);
  if (!value) {
    throw new Error(
      `Missing required server environment variable: ${keys.join(" or ")}`
    );
  }
  return value;
}

export function getServerEnv() {
  return {
    privyAppId: requireServerEnv("PRIVY_APP_ID"),
    privyAppSecret: requireServerEnv("PRIVY_APP_SECRET"),
    supabaseSecretKey: requireServerEnv("SUPABASE_SECRET_KEY"),
    supabaseUrl: requireServerEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
  };
}

export function getServerPublicEnv() {
  return {
    privyAppId: readServerEnv("PRIVY_APP_ID"),
    privyClientId: readServerEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID")
  };
}
