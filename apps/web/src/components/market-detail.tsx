"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOpenStratApi } from "./auth-gate";
import type {
  PerpMarketDetailResponse,
  StrategyReadinessCheck
} from "@/types/openstrat";

export function MarketDetail({ marketKey }: { marketKey: string }) {
  const { requestJson } = useOpenStratApi();
  const [detail, setDetail] = useState<PerpMarketDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    requestJson<PerpMarketDetailResponse>(
      `/api/markets/perps/${encodeURIComponent(marketKey)}`
    )
      .then((response) => {
        if (!cancelled) {
          setDetail(response);
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
  }, [marketKey, requestJson]);

  const candleValues = useMemo(
    () => detail?.candles.map((candle) => candle.close) ?? [],
    [detail?.candles]
  );
  const fundingValues = useMemo(
    () => detail?.funding_history.map((point) => point.value) ?? [],
    [detail?.funding_history]
  );

  if (error) {
    return <div className="setup-alert">{error}</div>;
  }

  if (!detail) {
    return <main className="loading-screen">Loading market analytics</main>;
  }

  return (
    <main className="market-detail">
      <Link className="back-link" href="/">
        Back to markets
      </Link>

      <section className="cockpit-header detail-header">
        <div>
          <p className="eyebrow">
            {detail.market.dex} / {detail.market.category}
          </p>
          <h1>{detail.market.display_symbol}</h1>
          <p>{detail.readiness.summary}</p>
        </div>
        <div className="readiness-score">
          <span>Strategy readiness</span>
          <strong>{Math.round(detail.readiness.score * 100)}%</strong>
        </div>
      </section>

      <section className="metrics-band cockpit-metrics">
        <DetailMetric label="Price" value={formatPrice(detail.market.price)} />
        <DetailMetric label="24h change" value={percent(detail.market.change_24h)} />
        <DetailMetric
          label="Funding ann."
          value={percent(detail.market.annualized_funding)}
        />
        <DetailMetric
          label="Open interest"
          value={compactUsd(detail.market.open_interest_notional)}
        />
        <DetailMetric
          label="Realized vol"
          value={
            detail.realized_volatility === null
              ? "pending"
              : percent(detail.realized_volatility)
          }
        />
      </section>

      <section className="detail-grid">
        <article className="analysis-panel wide">
          <div className="panel-heading">
            <h2>Price and volatility</h2>
            <small>15m candles / last 24h</small>
          </div>
          <Sparkline values={candleValues} tone="info" />
          <dl className="detail-list">
            <div>
              <dt>Oracle divergence</dt>
              <dd>{percent(detail.market.oracle_divergence)}</dd>
            </div>
            <div>
              <dt>Premium</dt>
              <dd>
                {detail.market.premium === null
                  ? "n/a"
                  : percent(detail.market.premium)}
              </dd>
            </div>
            <div>
              <dt>Max leverage</dt>
              <dd>{detail.market.max_leverage}x</dd>
            </div>
          </dl>
        </article>

        <article className="analysis-panel">
          <div className="panel-heading">
            <h2>Funding regime</h2>
            <small>Last 7 days</small>
          </div>
          <Sparkline values={fundingValues} tone="funding" />
          <p className="panel-note">
            Current funding is {percent(detail.market.funding_rate)} per interval,
            annualized to {percent(detail.market.annualized_funding)}.
          </p>
        </article>

        <article className="analysis-panel">
          <div className="panel-heading">
            <h2>Depth snapshot</h2>
            <small>L2 book</small>
          </div>
          {detail.depth ? (
            <>
              <div className="depth-imbalance">
                <span style={{ flex: Math.max(0.05, detail.depth.bid_notional) }} />
                <span style={{ flex: Math.max(0.05, detail.depth.ask_notional) }} />
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Spread</dt>
                  <dd>
                    {detail.depth.spread_bps === null
                      ? "n/a"
                      : `${detail.depth.spread_bps.toFixed(1)} bps`}
                  </dd>
                </div>
                <div>
                  <dt>Bid depth</dt>
                  <dd>{compactUsd(detail.depth.bid_notional)}</dd>
                </div>
                <div>
                  <dt>Ask depth</dt>
                  <dd>{compactUsd(detail.depth.ask_notional)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="panel-note">Depth is unavailable for this market.</p>
          )}
        </article>

        <article className="analysis-panel readiness-panel">
          <div className="panel-heading">
            <h2>Readiness rail</h2>
            <small>Research constraints</small>
          </div>
          <div className="readiness-list">
            {detail.readiness.checks.map((check) => (
              <ReadinessCheck check={check} key={check.label} />
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReadinessCheck({ check }: { check: StrategyReadinessCheck }) {
  return (
    <div className={check.ok ? "readiness-check ok" : "readiness-check"}>
      <span>{check.ok ? "Pass" : "Review"}</span>
      <strong>{check.label}</strong>
      <small>{check.value}</small>
    </div>
  );
}

function Sparkline({ tone, values }: { tone: "funding" | "info"; values: number[] }) {
  if (values.length === 0) {
    return <div className="sparkline empty">No series</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 86 - 7;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      className={`sparkline ${tone}`}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <polyline points={points} />
    </svg>
  );
}

function compactUsd(value: number): string {
  return `$${Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 2,
    notation: "compact"
  }).format(value)}`;
}

function formatPrice(value: number): string {
  if (value >= 1_000) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (value >= 1) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  return `$${value.toPrecision(4)}`;
}

function percent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}
