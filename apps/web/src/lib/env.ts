export type NetworkType = "mainnet" | "testnet";

const networkType = (
  process.env.NEXT_PUBLIC_NETWORK_TYPE === "mainnet" ? "mainnet" : "testnet"
) satisfies NetworkType;

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

export const publicEnv = {
  appUrl: firstNonEmpty(process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000"),
  hyperEvmMainnetRpcUrl: firstNonEmpty(
    process.env.NEXT_PUBLIC_HYPER_EVM_MAINNET_RPC_URL,
    "https://rpc.hyperliquid.xyz/evm"
  ),
  hyperEvmRpcUrl: firstNonEmpty(
    process.env.NEXT_PUBLIC_HYPER_EVM_RPC_URL,
    "https://rpcs.chain.link/hyperevm/testnet"
  ),
  hyperEvmTestnetRpcUrl: firstNonEmpty(
    process.env.NEXT_PUBLIC_HYPER_EVM_TESTNET_RPC_URL,
    "https://rpcs.chain.link/hyperevm/testnet"
  ),
  networkType,
  privyClientId: firstNonEmpty(process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID),
  supabasePublishableKey: firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ),
  supabaseUrl: firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL)
} as const;
