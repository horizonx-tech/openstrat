"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOpenStratApi } from "./auth-gate";
import type {
  PerpDexHealth,
  PerpMarketRow,
  PerpScreenerFilter,
  PerpsScreenerResponse,
  StrategyRecord
} from "@/types/openstrat";

type SortKey =
  | "annualized_funding"
  | "change_24h"
  | "liquidity_score"
  | "open_interest_notional"
  | "price"
  | "volume_24h";

const FILTERS: Array<{ id: PerpScreenerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "majors", label: "Majors" },
  { id: "hip3", label: "HIP-3" },
  { id: "high-funding", label: "High funding" },
  { id: "high-oi", label: "High OI" },
  { id: "oi-cap-risk", label: "OI cap risk" },
  { id: "low-liquidity", label: "Low liquidity" },
  { id: "watchlist", label: "Watchlist" }
];

const PAGE_SIZE = 10;

export function Dashboard() {
  const { profile, requestJson } = useOpenStratApi();
  const [snapshot, setSnapshot] = useState<PerpsScreenerResponse | null>(null);
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [filter, setFilter] = useState<PerpScreenerFilter>("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("volume_24h");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<PerpsScreenerResponse>("/api/markets/perps"),
      requestJson<{ strategies: StrategyRecord[] }>("/api/strategies")
    ])
      .then(([marketResponse, strategyResponse]) => {
        if (!cancelled) {
          setSnapshot(marketResponse);
          setStrategies(strategyResponse.strategies);
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

  const rows = useMemo(() => {
    const nextRows = [...filterRows(snapshot?.rows ?? [], filter)];
    return nextRows.sort((a, b) => b[sortKey] - a[sortKey]);
  }, [filter, snapshot?.rows, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [filter, sortKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(rows.length, currentPage * PAGE_SIZE);
  const pagedRows = rows.slice(pageStart === 0 ? 0 : pageStart - 1, pageEnd);
  const pageItems = buildPageItems(currentPage, pageCount);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const totals = useMemo(() => {
    const sourceRows = snapshot?.rows ?? [];
    return {
      hip3: sourceRows.filter((row) => row.dex !== "Hyperliquid").length,
      markets: sourceRows.length,
      oi: sourceRows.reduce((total, row) => total + row.open_interest_notional, 0),
      volume: sourceRows.reduce((total, row) => total + row.volume_24h, 0)
    };
  }, [snapshot?.rows]);

  return (
    <main className="dashboard">
      <section className="cockpit-header">
        <div>
          <p className="eyebrow">Hyperliquid perps cockpit</p>
          <h1>Markets</h1>
          <p>
            Live perps state, funding pressure, liquidity and HIP-3 capacity for
            strategy research.
          </p>
        </div>
        <div className="header-actions">
          <Link className="ghost-action" href="#strategies">
            My strategies
          </Link>
          <Link className="primary-action" href="/strategies/new">
            Create strategy
          </Link>
        </div>
      </section>

      {error ? <div className="setup-alert">{error}</div> : null}

      <section className="metrics-band cockpit-metrics">
        <Metric label="Profile" value={profile ? "Linked" : "Syncing"} />
        <Metric label="Markets" value={String(totals.markets || "-")} />
        <Metric
          label="24h volume"
          value={totals.volume ? compactUsd(totals.volume) : "-"}
        />
        <Metric label="Open interest" value={totals.oi ? compactUsd(totals.oi) : "-"} />
        <Metric label="HIP-3" value={String(totals.hip3 || "-")} />
      </section>

      <section className="screener-shell">
        <div className="section-toolbar">
          <div>
            <h2>Perps screener</h2>
            <small>
              {snapshot
                ? `${snapshot.source_status} / ${relativeTime(snapshot.generated_at)}`
                : "Loading live Hyperliquid state"}
            </small>
          </div>
          <label className="sort-control">
            Sort
            <select
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              value={sortKey}
            >
              <option value="volume_24h">24h volume</option>
              <option value="open_interest_notional">Open interest</option>
              <option value="annualized_funding">Funding</option>
              <option value="change_24h">24h change</option>
              <option value="liquidity_score">Liquidity</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>

        <div className="filter-strip" role="tablist" aria-label="Perps filters">
          {FILTERS.map((item) => (
            <button
              aria-selected={filter === item.id}
              className={filter === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setFilter(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="market-table-wrap">
          <table className="market-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Price</th>
                <th>24h</th>
                <th>Volume</th>
                <th>Open interest</th>
                <th>Funding ann.</th>
                <th>Premium</th>
                <th>Liquidity</th>
                <th>Cap</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <MarketRow key={row.market_key} row={row} />
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="table-empty">
              {filter === "watchlist"
                ? "Watchlist storage is not enabled yet."
                : "No markets match this filter."}
            </div>
          ) : null}
        </div>

        <div className="pagination-bar">
          <span>
            {rows.length === 0
              ? "No markets"
              : `${pageStart}-${pageEnd} of ${rows.length} markets`}
          </span>
          {pageCount > 1 ? (
            <div className="pagination-controls" aria-label="Screener pagination">
              <button
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                Prev
              </button>
              {pageItems.map((item, index) =>
                item === "gap" ? (
                  <span
                    aria-hidden="true"
                    className="pagination-gap"
                    key={`${item}-${index}`}
                  >
                    ...
                  </span>
                ) : (
                  <button
                    aria-current={item === currentPage ? "page" : undefined}
                    className={item === currentPage ? "active" : ""}
                    key={item}
                    onClick={() => setPage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                )
              )}
              <button
                disabled={currentPage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="dex-health-grid">
        <div className="section-toolbar">
          <div>
            <h2>HIP-3 and dex health</h2>
            <small>Capacity, cap pressure and deployer context</small>
          </div>
        </div>
        {(snapshot?.dex_health ?? []).map((dex) => (
          <DexHealth key={dex.dex} dex={dex} />
        ))}
      </section>

      <section className="strategy-section" id="strategies">
        <div className="section-toolbar">
          <div>
            <h2>Strategy requests</h2>
            <small>Research briefs and deployment reports</small>
          </div>
          <Link className="ghost-action" href="/strategies/new">
            New request
          </Link>
        </div>
        {strategies.length === 0 ? (
          <div className="empty-state compact-empty">
            <h3>No strategy requests yet</h3>
            <p>
              Start with a market, timeframe, leverage appetite and the factors the
              agent should research. This shell stores the request without running an
              agent.
            </p>
            <Link href="/strategies/new">Create strategy</Link>
          </div>
        ) : (
          <div className="strategy-list">
            {strategies.map((strategy) => (
              <Link
                className="strategy-row"
                href={`/strategies/${strategy.id}`}
                key={strategy.id}
              >
                <span>
                  <strong>{strategy.title}</strong>
                  <small>
                    {strategy.market} / {strategy.timeframe} / {strategy.scan_cadence}
                  </small>
                </span>
                <span className="status-pill">{strategy.status}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MarketRow({ row }: { row: PerpMarketRow }) {
  return (
    <tr>
      <td>
        <Link
          className="market-name"
          href={`/markets/${encodeURIComponent(row.market_key)}`}
        >
          <span
            className={row.dex === "Hyperliquid" ? "token-dot" : "token-dot hip3"}
          />
          <span>
            <strong>{row.display_symbol}</strong>
            <small>
              {row.dex} / {row.category}
            </small>
          </span>
        </Link>
      </td>
      <td>{formatPrice(row.price)}</td>
      <td className={row.change_24h >= 0 ? "positive" : "negative"}>
        {percent(row.change_24h)}
      </td>
      <td>{compactUsd(row.volume_24h)}</td>
      <td>{compactUsd(row.open_interest_notional)}</td>
      <td className={row.annualized_funding >= 0 ? "positive" : "negative"}>
        {percent(row.annualized_funding)}
      </td>
      <td className={row.oracle_divergence >= 0 ? "positive" : "negative"}>
        {percent(row.oracle_divergence)}
      </td>
      <td>
        <div className="liquidity-meter">
          <span style={{ width: `${Math.max(4, row.liquidity_score * 100)}%` }} />
        </div>
      </td>
      <td>
        {row.at_oi_cap ? (
          <span className="risk-chip">At cap</span>
        ) : row.open_interest_cap_utilization !== null ? (
          percent(row.open_interest_cap_utilization)
        ) : (
          "open"
        )}
      </td>
    </tr>
  );
}

function DexHealth({ dex }: { dex: PerpDexHealth }) {
  return (
    <article className="dex-health">
      <div>
        <h3>{dex.dex}</h3>
        <small>{dex.deployer ?? "native perp dex"}</small>
      </div>
      <dl>
        <div>
          <dt>Markets</dt>
          <dd>
            {dex.active_markets}/{dex.market_count}
          </dd>
        </div>
        <div>
          <dt>24h volume</dt>
          <dd>{compactUsd(dex.total_volume_24h)}</dd>
        </div>
        <div>
          <dt>Open interest</dt>
          <dd>{compactUsd(dex.total_open_interest_notional)}</dd>
        </div>
        <div>
          <dt>Net deposit</dt>
          <dd>
            {dex.total_net_deposit === null ? "n/a" : compactUsd(dex.total_net_deposit)}
          </dd>
        </div>
      </dl>
      <div className="cap-line">
        <span>
          Cap use{" "}
          {dex.open_interest_cap_utilization === null
            ? "uncapped"
            : percent(dex.open_interest_cap_utilization)}
        </span>
        <strong>{dex.at_oi_cap.length} at cap</strong>
      </div>
    </article>
  );
}

function filterRows(rows: PerpMarketRow[], filter: PerpScreenerFilter) {
  switch (filter) {
    case "majors":
      return rows.filter((row) => row.category === "majors");
    case "hip3":
      return rows.filter((row) => row.dex !== "Hyperliquid");
    case "high-funding":
      return rows.filter((row) => Math.abs(row.annualized_funding) >= 0.25);
    case "high-oi":
      return rows.filter((row) => row.open_interest_notional >= 100_000_000);
    case "oi-cap-risk":
      return rows.filter(
        (row) => row.at_oi_cap || (row.open_interest_cap_utilization ?? 0) >= 0.75
      );
    case "low-liquidity":
      return rows.filter((row) => row.liquidity_score < 0.45);
    case "watchlist":
      return [];
    case "all":
    default:
      return rows;
  }
}

function buildPageItems(currentPage: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount]);
  for (
    let pageNumber = Math.max(2, currentPage - 1);
    pageNumber <= Math.min(pageCount - 1, currentPage + 1);
    pageNumber += 1
  ) {
    pages.add(pageNumber);
  }

  const orderedPages = [...pages].sort((a, b) => a - b);
  return orderedPages.flatMap((pageNumber, index) => {
    const previous = orderedPages[index - 1];
    if (previous && pageNumber - previous > 1) {
      return ["gap", pageNumber] as const;
    }
    return [pageNumber];
  });
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

function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return "just now";
  }
  const seconds = Math.round(elapsed / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
