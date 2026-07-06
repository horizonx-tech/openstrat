"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { configuredHyperEvmChain } from "@/lib/chains";
import { publicEnv } from "@/lib/env";

type ProvidersProps = {
  children: ReactNode;
  privyAppId?: string;
  privyClientId?: string;
};

export function Providers({ children, privyAppId, privyClientId }: ProvidersProps) {
  const appId = privyAppId ?? "";
  const clientId = privyClientId || publicEnv.privyClientId;

  if (!appId) {
    return (
      <main className="loading-screen">
        Missing PRIVY_APP_ID. Copy the root .env.example contract into .env and set the
        Privy app ID before running the web app.
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId || undefined}
      config={{
        appearance: {
          showWalletLoginFirst: true,
          theme: "dark",
          walletChainType: "ethereum-only",
          walletList: [
            "metamask",
            "rainbow",
            "wallet_connect",
            "rabby_wallet",
            "detected_wallets",
            "detected_solana_wallets",
            "detected_ethereum_wallets",
            "coinbase_wallet",
            "cryptocom",
            "uniswap",
            "solflare",
            "binance",
            "bitget_wallet",
            "wallet_connect",
            "wallet_connect_qr",
            "base_account"
          ]
        },
        defaultChain: configuredHyperEvmChain,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets"
          }
        },
        loginMethods: ["wallet", "email"],
        supportedChains: [configuredHyperEvmChain]
      }}
    >
      {children}
    </PrivyProvider>
  );
}
