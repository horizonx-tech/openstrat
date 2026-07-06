import { AuthGate } from "@/components/auth-gate";
import { StrategyReport } from "@/components/strategy-report";

interface PageProps {
  params: Promise<{ strategyId: string }>;
}

export default async function StrategyPage({ params }: PageProps) {
  const { strategyId } = await params;
  return (
    <AuthGate>
      <StrategyReport strategyId={strategyId} />
    </AuthGate>
  );
}
