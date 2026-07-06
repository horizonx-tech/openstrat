import { defineChain } from "viem";
import { publicEnv } from "./env";

export const HYPER_EVM_CHAIN_ID = {
  mainnet: 999,
  testnet: 998
} as const;

export const hyperEvm = defineChain({
  id: HYPER_EVM_CHAIN_ID.mainnet,
  name: "Hyperliquid EVM",
  nativeCurrency: { decimals: 18, name: "HYPE", symbol: "HYPE" },
  rpcUrls: {
    default: { http: [publicEnv.hyperEvmMainnetRpcUrl] },
    public: { http: [publicEnv.hyperEvmMainnetRpcUrl] }
  },
  blockExplorers: {
    default: { name: "HyperEVMScan", url: "https://hyperevmscan.io" }
  }
});

export const hyperEvmTestnet = defineChain({
  id: HYPER_EVM_CHAIN_ID.testnet,
  name: "Hyperliquid EVM Testnet",
  nativeCurrency: { decimals: 18, name: "HYPE", symbol: "HYPE" },
  rpcUrls: {
    default: { http: [publicEnv.hyperEvmTestnetRpcUrl] },
    public: { http: [publicEnv.hyperEvmTestnetRpcUrl] }
  },
  blockExplorers: {
    default: { name: "Purrsec Testnet", url: "https://testnet.purrsec.com" }
  },
  testnet: true
});

export const configuredHyperEvmChain =
  publicEnv.networkType === "mainnet" ? hyperEvm : hyperEvmTestnet;
