import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { getServerPublicEnv } from "@/lib/server-env";
import "./globals.css";

export const metadata: Metadata = {
  description: "Managed strategy research shell for Hyperliquid traders.",
  title: "OpenStrat"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { privyAppId, privyClientId } = getServerPublicEnv();

  return (
    <html lang="en">
      <body>
        <Providers privyAppId={privyAppId} privyClientId={privyClientId}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
