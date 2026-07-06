import type { AgentRuntimeStatus } from "@/types/openstrat";

const DEFAULT_CODEX_MODEL = "codex-default";

export function getAgentRuntimeStatus(
  env: Record<string, string | undefined> = process.env
): AgentRuntimeStatus {
  const configuredCodexModel = env.OPENSTRAT_CODEX_MODEL?.trim();
  const codexModelId = configuredCodexModel || DEFAULT_CODEX_MODEL;
  const runtimeEnabled = env.OPENSTRAT_AGENT_RUNTIME_ENABLED === "true";

  return {
    boundary: {
      app_auth: "Privy wallet or email session",
      model_auth: "Codex-owned ChatGPT or API-key auth",
      secret_material_policy:
        "OpenStrat stores connector state and artifacts, not Codex tokens."
    },
    default_model_id: codexModelId,
    providers: [
      {
        auth_modes: ["chatgpt", "api_key"],
        connection_detail: runtimeEnabled
          ? "Codex runtime execution is enabled for this deployment."
          : "Strategy prompts are queued until a Codex app-server bridge is enabled.",
        connection_state: runtimeEnabled ? "available" : "requires_bridge",
        id: "codex",
        label: "Codex",
        models: [
          {
            enabled: runtimeEnabled,
            id: codexModelId,
            label: configuredCodexModel || "Codex default",
            route: "via user's ChatGPT or Codex API auth"
          }
        ],
        note: "Codex owns model selection, ChatGPT/API-key auth, sandboxing, approval prompts, file edits, shell execution, and resumable coding threads.",
        primary_action: runtimeEnabled ? "Runtime enabled" : "Connect Codex",
        primary_action_enabled: false,
        status_label: runtimeEnabled ? "Ready" : "Bridge required"
      },
      {
        auth_modes: ["credits"],
        connection_detail:
          "Future managed credits can run hosted OpenAI or OpenRouter routes without user Codex auth.",
        connection_state: "planned",
        id: "openstrat-credits",
        label: "OpenStrat credits",
        models: [
          {
            enabled: false,
            id: "managed-auto",
            label: "Auto",
            route: "via in-app usage credits"
          }
        ],
        note: "This is the later subscription path, not the migration-critical Codex path.",
        primary_action: "Planned",
        primary_action_enabled: false,
        status_label: "Planned"
      },
      {
        auth_modes: ["api_key"],
        connection_detail:
          "Bring-your-own API key routing is a later provider connector.",
        connection_state: "planned",
        id: "api-keys",
        label: "API keys",
        models: [
          {
            enabled: false,
            id: "openai-api",
            label: "OpenAI API",
            route: "via user API key"
          },
          {
            enabled: false,
            id: "openrouter-api",
            label: "OpenRouter",
            route: "via user API key"
          }
        ],
        note: "API-key routing should not block the first Codex app integration.",
        primary_action: "Configure later",
        primary_action_enabled: false,
        status_label: "Planned"
      }
    ],
    runtime_enabled: runtimeEnabled,
    selected_provider_id: "codex"
  };
}
