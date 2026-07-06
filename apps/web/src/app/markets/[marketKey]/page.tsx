import { AuthGate } from "@/components/auth-gate";
import { MarketDetail } from "@/components/market-detail";

interface MarketPageProps {
  params: Promise<{
    marketKey: string;
  }>;
}

export default async function MarketPage({ params }: MarketPageProps) {
  const { marketKey } = await params;
  return (
    <AuthGate>
      <MarketDetail marketKey={decodeURIComponent(marketKey)} />
    </AuthGate>
  );
}
