import { AuthGate } from "@/components/auth-gate";
import { Dashboard } from "@/components/dashboard";

export default function HomePage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
