import { AuthGate } from "@/components/auth-gate";
import { Dashboard } from "@/components/dashboard";

export default function MarketsPage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
