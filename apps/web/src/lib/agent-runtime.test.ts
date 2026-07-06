import { describe, expect, it } from "vitest";
import { getAgentRuntimeStatus } from "./agent-runtime";

describe("agent runtime web status", () => {
  it("keeps Codex as the primary connector without claiming live runtime access", () => {
    const status = getAgentRuntimeStatus({});

    expect(status.runtime_enabled).toBe(false);
    expect(status.selected_provider_id).toBe("codex");
    expect(status.boundary).toEqual({
      app_auth: "Privy wallet or email session",
      model_auth: "Codex-owned ChatGPT or API-key auth",
      secret_material_policy:
        "OpenStrat stores connector state and artifacts, not Codex tokens."
    });
    expect(status.providers[0]).toMatchObject({
      connection_state: "requires_bridge",
      id: "codex",
      primary_action: "Connect Codex",
      primary_action_enabled: false,
      status_label: "Bridge required"
    });
  });

  it("reflects enabled runtime deployments and configured Codex model", () => {
    const status = getAgentRuntimeStatus({
      OPENSTRAT_AGENT_RUNTIME_ENABLED: "true",
      OPENSTRAT_CODEX_MODEL: "gpt-5.1-codex"
    });

    expect(status.runtime_enabled).toBe(true);
    expect(status.default_model_id).toBe("gpt-5.1-codex");
    expect(status.providers[0]).toMatchObject({
      connection_state: "available",
      primary_action: "Runtime enabled",
      status_label: "Ready"
    });
    expect(status.providers[0]?.models[0]).toMatchObject({
      enabled: true,
      id: "gpt-5.1-codex",
      label: "gpt-5.1-codex"
    });
  });
});
