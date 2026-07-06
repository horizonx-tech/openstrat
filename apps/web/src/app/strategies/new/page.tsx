import { AuthGate } from "@/components/auth-gate";
import { StrategyWorkspace } from "@/components/strategy-workspace";

export default function NewStrategyPage() {
  return (
    <AuthGate>
      <StrategyWorkspace />
    </AuthGate>
  );
}
