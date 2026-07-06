"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOpenStratApi } from "./auth-gate";
import type { StrategyRecord } from "@/types/openstrat";

export function StrategyReport({ strategyId }: { strategyId: string }) {
  const { requestJson } = useOpenStratApi();
  const [strategy, setStrategy] = useState<StrategyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestJson<{ strategy: StrategyRecord }>(`/api/strategies/${strategyId}`)
      .then((response) => {
        if (!cancelled) {
          setStrategy(response.strategy);
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
  }, [requestJson, strategyId]);

  if (error) {
    return <div className="setup-alert">{error}</div>;
  }

  if (!strategy) {
    return <main className="loading-screen">Loading strategy report</main>;
  }

  return (
    <main className="report">
      <Link className="back-link" href="/">
        Back to dashboard
      </Link>
      <section className="cockpit-header report-head">
        <div>
          <p className="eyebrow">Strategy report</p>
          <h1>{strategy.title}</h1>
          <p>{strategy.summary}</p>
        </div>
        <span className="status-pill">{strategy.status}</span>
      </section>

      <section className="metrics-band">
        <ReportMetric label="Market" value={strategy.market} />
        <ReportMetric label="Scan cadence" value={strategy.scan_cadence} />
        <ReportMetric label="Deployment" value={strategy.deployment_status} />
        <ReportMetric label="Leverage" value={`${strategy.leverage ?? "-"}x`} />
      </section>

      <section className="report-grid">
        <article className="report-panel">
          <h2>How it works</h2>
          <p>
            The strategy prompt is stored as a managed research brief. Future agent runs
            should attach data ingestion, backtest evidence, risk review, and deploy
            gating artifacts to this page.
          </p>
          <blockquote>{strategy.prompt}</blockquote>
        </article>
        <article className="report-panel">
          <h2>Market factors</h2>
          <div className="factor-list">
            {strategy.factors.map((factor) => (
              <span key={factor}>{factor}</span>
            ))}
          </div>
        </article>
        <article className="report-panel">
          <h2>Schedule</h2>
          <dl className="detail-list">
            <div>
              <dt>Research schedule</dt>
              <dd>{strategy.schedule}</dd>
            </div>
            <div>
              <dt>Timeframe</dt>
              <dd>{strategy.timeframe}</dd>
            </div>
            <div>
              <dt>Risk profile</dt>
              <dd>{strategy.risk_profile}</dd>
            </div>
          </dl>
        </article>
        <article className="report-panel">
          <h2>Backtest and PnL</h2>
          <div className="placeholder-ledger">
            <span>Win rate pending</span>
            <span>Drawdown pending</span>
            <span>Real-time PnL disabled</span>
          </div>
        </article>
      </section>
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
