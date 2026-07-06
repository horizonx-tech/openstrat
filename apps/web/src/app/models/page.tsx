import { AuthGate } from "@/components/auth-gate";
import { ModelSettings } from "@/components/model-settings";

export default function ModelsPage() {
  return (
    <AuthGate>
      <ModelSettings />
    </AuthGate>
  );
}
