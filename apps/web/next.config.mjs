import nextEnv from "@next/env";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectDir, "../..");

const { loadEnvConfig } = nextEnv;
loadEnvConfig(workspaceRoot);

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

const publicBuildEnv = {
  NEXT_PUBLIC_APP_URL: firstNonEmpty(
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3000"
  ),
  NEXT_PUBLIC_HYPER_EVM_MAINNET_RPC_URL: firstNonEmpty(
    process.env.NEXT_PUBLIC_HYPER_EVM_MAINNET_RPC_URL,
    "https://rpc.hyperliquid.xyz/evm"
  ),
  NEXT_PUBLIC_HYPER_EVM_RPC_URL: firstNonEmpty(
    process.env.NEXT_PUBLIC_HYPER_EVM_RPC_URL,
    "https://rpcs.chain.link/hyperevm/testnet"
  ),
  NEXT_PUBLIC_HYPER_EVM_TESTNET_RPC_URL: firstNonEmpty(
    process.env.NEXT_PUBLIC_HYPER_EVM_TESTNET_RPC_URL,
    "https://rpcs.chain.link/hyperevm/testnet"
  ),
  NEXT_PUBLIC_NETWORK_TYPE: firstNonEmpty(
    process.env.NEXT_PUBLIC_NETWORK_TYPE,
    "testnet"
  ),
  NEXT_PUBLIC_PRIVY_CLIENT_ID: firstNonEmpty(process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ),
  NEXT_PUBLIC_SUPABASE_URL: firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL
  )
};

Object.assign(process.env, publicBuildEnv);

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: publicBuildEnv,
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  },
  transpilePackages: ["@openstrat/domain", "@openstrat/market-data"]
};

export default nextConfig;
