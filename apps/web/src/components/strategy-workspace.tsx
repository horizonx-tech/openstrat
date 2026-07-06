"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOpenStratApi } from "./auth-gate";
import type {
  AgentRuntimeStatus,
  PerpsScreenerResponse,
  StrategyRecord
} from "@/types/openstrat";

export function StrategyWorkspace() {
  const router = useRouter();
  const { requestJson } = useOpenStratApi();
  const [prompt, setPrompt] = useState(
    "Write a strategy that works on the 15-minute time frame of BTC perps and uses at least 10x leverage. This is deliberately high risk, with volatility and liquidity signals prioritized."
  );
  const [market, setMarket] = useState("BTC-PERP");
  const [timeframe, setTimeframe] = useState("15m");
  const [leverage, setLeverage] = useState(10);
  const [markets, setMarkets] = useState<PerpsScreenerResponse | null>(null);
  const [runtime, setRuntime] = useState<AgentRuntimeStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<PerpsScreenerResponse>("/api/markets/perps"),
      requestJson<AgentRuntimeStatus>("/api/agent-runtime")
    ])
      .then(([marketResponse, runtimeResponse]) => {
        if (!cancelled) {
          setMarkets(marketResponse);
          setRuntime(runtimeResponse);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarkets(null);
          setRuntime(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestJson]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await requestJson<{ strategy: StrategyRecord }>(
        "/api/strategies",
        {
          body: JSON.stringify({
            leverage,
            market,
            prompt,
            risk_profile: leverage >= 10 ? "high-risk" : "balanced",
            timeframe
          }),
          method: "POST"
        }
      );
      router.push(`/strategies/${response.strategy.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="workspace">
      <section className="cockpit-header workspace-head">
        <div>
          <p className="eyebrow">Create strategy</p>
          <h1>Research brief</h1>
          <p>
            Capture a market, timeframe and risk envelope. The agent loop remains
            disabled; this stores the report shell for later research and backtests.
          </p>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="prompt-panel">
          <label htmlFor="strategy-prompt">Strategy prompt</label>
          <textarea
            id="strategy-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            value={prompt}
          />
          {error ? <div className="setup-alert">{error}</div> : null}
          <button
            aria-busy={submitting}
            disabled={submitting}
            onClick={() => void submit()}
            type="button"
          >
            {submitting ? "Saving request" : "Initiate strategy"}
          </button>
        </div>
        <aside className="control-panel">
          <label>
            Market
            <select onChange={(event) => setMarket(event.target.value)} value={market}>
              {(markets?.rows ?? fallbackMarkets()).map((row) => (
                <option key={row.market_key} value={`${row.market_key}-PERP`}>
                  {row.display_symbol} / {row.dex}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeframe
            <select
              onChange={(event) => setTimeframe(event.target.value)}
              value={timeframe}
            >
              <option>5m</option>
              <option>15m</option>
              <option>1h</option>
              <option>4h</option>
            </select>
          </label>
          <label>
            Leverage
            <input
              max="50"
              min="1"
              onChange={(event) => setLeverage(Number(event.target.value))}
              type="number"
              value={leverage}
            />
          </label>
          <div className="phase-stack">
            {["Research", "Backtest", "Risk preflight", "Deploy review"].map(
              (phase) => (
                <span key={phase}>{phase}</span>
              )
            )}
          </div>
          <div className="runtime-card">
            <span>Agent runtime</span>
            <strong>
              {runtime?.runtime_enabled ? "Codex connected" : "Codex not connected"}
            </strong>
            <p>
              {runtime?.runtime_enabled
                ? "Strategy requests can run through the Codex SDK worker."
                : "This request will queue until the Codex connector is enabled."}
            </p>
            <a href="/models">Manage models</a>
          </div>
        </aside>
      </section>
    </main>
  );
}

function fallbackMarkets() {
  return ["BTC", "ETH", "SOL", "HYPE"].map((symbol) => ({
    dex: "Hyperliquid",
    display_symbol: symbol,
    market_key: symbol
  }));
}
