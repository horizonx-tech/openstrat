"use client";

import { useEffect, useState } from "react";
import { useOpenStratApi } from "./auth-gate";
import type { AgentRuntimeProvider, AgentRuntimeStatus } from "@/types/openstrat";

export function ModelSettings() {
  const { requestJson } = useOpenStratApi();
  const [status, setStatus] = useState<AgentRuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestJson<AgentRuntimeStatus>("/api/agent-runtime")
      .then((response) => {
        if (!cancelled) {
          setStatus(response);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestJson]);

  const codex = status?.providers.find((provider) => provider.id === "codex");
  const secondaryProviders =
    status?.providers.filter((provider) => provider.id !== "codex") ?? [];

  return (
    <main className="models-page">
      <section className="cockpit-header models-head">
        <div>
          <p className="eyebrow">Agent models</p>
          <h1>Connect the strategy-writing runtime</h1>
          <p>
            Wallet login opens the OpenStrat workspace. Codex/ChatGPT auth is a separate
            connector that controls whether an agent can write, test, and revise
            strategy code.
          </p>
        </div>
      </section>

      {error ? <div className="setup-alert">{error}</div> : null}

      {codex ? <RuntimeProviderPanel provider={codex} primary /> : null}

      {status ? (
        <section className="runtime-boundary">
          <div>
            <span>Workspace auth</span>
            <strong>{status.boundary.app_auth}</strong>
          </div>
          <div>
            <span>Model auth</span>
            <strong>{status.boundary.model_auth}</strong>
          </div>
          <div>
            <span>Secret policy</span>
            <strong>{status.boundary.secret_material_policy}</strong>
          </div>
        </section>
      ) : null}

      <section className="provider-stack">
        <div className="section-toolbar">
          <div>
            <h2>Future routes</h2>
            <small>Provider slots without blocking the Codex migration</small>
          </div>
        </div>
        {secondaryProviders.map((provider) => (
          <RuntimeProviderPanel key={provider.id} provider={provider} />
        ))}
      </section>
    </main>
  );
}

function RuntimeProviderPanel({
  primary = false,
  provider
}: {
  primary?: boolean;
  provider: AgentRuntimeProvider;
}) {
  return (
    <section className={primary ? "provider-panel primary" : "provider-panel"}>
      <div className="provider-heading">
        <div>
          <span className="provider-icon">{providerIcon(provider.id)}</span>
          <div>
            <h2>{provider.label}</h2>
            <small>{provider.connection_detail}</small>
          </div>
        </div>
        <StatusBadge state={provider.connection_state} label={provider.status_label} />
      </div>

      <div className="model-list">
        {provider.models.map((model) => (
          <div className="model-row" key={model.id}>
            <div>
              <strong>{model.label}</strong>
              <span>{model.route}</span>
            </div>
            <span className={model.enabled ? "toggle-dot on" : "toggle-dot"} />
          </div>
        ))}
      </div>

      <div className="provider-foot">
        <p>{provider.note}</p>
        <button disabled={!provider.primary_action_enabled} type="button">
          {provider.primary_action}
        </button>
      </div>
    </section>
  );
}

function StatusBadge({
  label,
  state
}: {
  label: string;
  state: AgentRuntimeProvider["connection_state"];
}) {
  return <span className={`runtime-status ${state}`}>{label}</span>;
}

function providerIcon(providerId: string): string {
  switch (providerId) {
    case "codex":
      return "CX";
    case "openstrat-credits":
      return "OS";
    case "api-keys":
      return "API";
    default:
      return "AI";
  }
}
