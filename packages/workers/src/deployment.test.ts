import { describe, expect, it } from "vitest";
import {
  type Candle,
  type DeploymentGate,
  type MarketDatum,
  type MarketRegistryEntry,
  type RiskPolicy,
  type StrategyManifest,
  type TradeIntent
} from "@openstrat/domain";
import { SqliteEventLog } from "@openstrat/persistence";
import { defineStrategy } from "@openstrat/strategy-sdk";
import {
  FlyMachineDeploymentProvider,
  LocalTerminalDeploymentProvider,
  SpriteMicrovmDeploymentProvider,
  runLocalBot
} from "./index.js";

const now = "2026-06-04T00:00:00.000Z";

describe("local bot runtime", () => {
  it("runs locally in paper mode, emits heartbeats, validates risk, and records paper intents", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    const summary = await runLocalBot({
      manifest: botManifest({
        ends_at: "2026-06-04T00:15:00.000Z"
      }),
      strategy: paperIntentStrategy,
      strategy_manifest: sampleManifest(),
      deployment_gate: gate(),
      risk_policy: policy(),
      market: market(),
      latest_market_data: marketDatum(),
      market_events: [{ kind: "candle", candle: candle(now, 100) }],
      event_log: eventLog
    });

    const events = eventLog.list("bot_runs/bot_run_001");
    expect(summary.status).toBe("completed");
    expect(summary.heartbeats).toBe(1);
    expect(summary.intents_emitted).toBe(1);
    expect(summary.risk_reviews).toBe(1);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "bot.lifecycle.started",
        "bot.heartbeat",
        "bot.intent.emitted",
        "bot.risk.reviewed",
        "bot.paper.intent_recorded",
        "bot.lifecycle.completed"
      ])
    );
    eventLog.close();
  });

  it("stops at duration expiry before processing later market events", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    const summary = await runLocalBot({
      manifest: botManifest({
        ends_at: "2026-06-04T00:10:00.000Z"
      }),
      strategy: paperIntentStrategy,
      strategy_manifest: sampleManifest(),
      deployment_gate: gate(),
      risk_policy: policy(),
      market: market(),
      latest_market_data: marketDatum(),
      market_events: [
        { kind: "candle", candle: candle(now, 100) },
        { kind: "candle", candle: candle("2026-06-04T00:15:00.000Z", 101) }
      ],
      event_log: eventLog
    });

    expect(summary.stop_reason).toBe("duration_expired");
    expect(summary.heartbeats).toBe(1);
    expect(eventLog.list("bot_runs/bot_run_001").map((event) => event.type)).toContain(
      "bot.lifecycle.duration_expired"
    );
    eventLog.close();
  });

  it("supports manual stop without launching remote infrastructure", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    const summary = await runLocalBot({
      manifest: botManifest(),
      strategy: paperIntentStrategy,
      strategy_manifest: sampleManifest(),
      deployment_gate: gate(),
      risk_policy: policy(),
      market: market(),
      latest_market_data: marketDatum(),
      market_events: [{ kind: "candle", candle: candle(now, 100) }],
      event_log: eventLog,
      should_stop: () => true
    });

    expect(summary.status).toBe("stopped");
    expect(summary.stop_reason).toBe("manual_stop");
    expect(eventLog.list("bot_runs/bot_run_001").map((event) => event.type)).toContain(
      "bot.lifecycle.manual_stop_requested"
    );
    eventLog.close();
  });

  it("rejects missing approval artifacts before running", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    await expect(
      runLocalBot({
        manifest: {
          ...botManifest(),
          approval_refs: {
            strategy_manifest_ref: "strategies/sample/manifest.json",
            deployment_gate_ref: "gates/gate_001.json"
          }
        } as never,
        strategy: paperIntentStrategy,
        strategy_manifest: sampleManifest(),
        deployment_gate: gate(),
        risk_policy: policy(),
        market: market(),
        latest_market_data: marketDatum(),
        market_events: [{ kind: "candle", candle: candle(now, 100) }],
        event_log: eventLog
      })
    ).rejects.toThrow(/approval/i);
    eventLog.close();
  });

  it("never records paper execution when risk validation rejects an intent", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    const summary = await runLocalBot({
      manifest: botManifest(),
      strategy: paperIntentStrategy,
      strategy_manifest: sampleManifest(),
      deployment_gate: gate(),
      risk_policy: policy({ max_notional_usd: 100 }),
      market: market(),
      latest_market_data: marketDatum(),
      market_events: [{ kind: "candle", candle: candle(now, 100) }],
      event_log: eventLog
    });

    const eventTypes = eventLog.list("bot_runs/bot_run_001").map((event) => event.type);
    expect(summary.risk_reviews).toBe(1);
    expect(eventTypes).toContain("bot.risk.reviewed");
    expect(eventTypes).not.toContain("bot.paper.intent_recorded");
    eventLog.close();
  });

  it("checks policy kill switch before running ticks", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    const summary = await runLocalBot({
      manifest: botManifest(),
      strategy: paperIntentStrategy,
      strategy_manifest: sampleManifest(),
      deployment_gate: gate(),
      risk_policy: policy({ kill_switch: true }),
      market: market(),
      latest_market_data: marketDatum(),
      market_events: [{ kind: "candle", candle: candle(now, 100) }],
      event_log: eventLog
    });

    expect(summary.status).toBe("stopped");
    expect(summary.stop_reason).toBe("kill_switch");
    expect(eventLog.list("bot_runs/bot_run_001").map((event) => event.type)).toContain(
      "bot.lifecycle.kill_switch_triggered"
    );
    eventLog.close();
  });
});

describe("deployment providers", () => {
  it("uses one BotRunManifest contract across local, Fly, and Sprites providers", async () => {
    const localManifest = botManifest();
    const flyManifest = botManifest({
      target: { kind: "fly_machine", app_name: "openstrat-bot", region: "iad" }
    });
    const spriteManifest = botManifest({
      target: {
        kind: "sprite_microvm",
        project: "openstrat",
        image: "registry.example/openstrat-bot:latest"
      }
    });
    const providers = [
      new LocalTerminalDeploymentProvider(),
      new FlyMachineDeploymentProvider({
        command_exists: () => true,
        is_authenticated: () => true
      }),
      new SpriteMicrovmDeploymentProvider({
        command_exists: () => true,
        is_authenticated: () => true
      })
    ];
    const manifests = [localManifest, flyManifest, spriteManifest];

    const plans = providers.map((provider, index) =>
      provider.prepare(manifests[index])
    );
    expect(plans.map((plan) => plan.bot_run_id)).toEqual([
      localManifest.id,
      flyManifest.id,
      spriteManifest.id
    ]);
    expect(plans.map((plan) => plan.guarantees)).toEqual(
      plans.map(() =>
        expect.arrayContaining([
          "approved_manifest_required",
          "risk_gate_required",
          "event_logging_required",
          "heartbeat_required",
          "duration_enforced",
          "kill_switch_enforced",
          "user_owned_credentials_only"
        ])
      )
    );
  });

  it("local_terminal provider launches the local runner without remote services", async () => {
    const eventLog = new SqliteEventLog(":memory:");
    const provider = new LocalTerminalDeploymentProvider();
    const result = await provider.launch(provider.prepare(botManifest()), {
      manifest: botManifest(),
      strategy: paperIntentStrategy,
      strategy_manifest: sampleManifest(),
      deployment_gate: gate(),
      risk_policy: policy(),
      market: market(),
      latest_market_data: marketDatum(),
      market_events: [{ kind: "candle", candle: candle(now, 100) }],
      event_log: eventLog
    });

    expect(result.launched).toBe(true);
    expect(result.remote).toBe(false);
    expect(result.summary?.status).toBe("completed");
    eventLog.close();
  });

  it("Fly and Sprites providers fail gracefully when CLI or auth is unavailable", () => {
    const fly = new FlyMachineDeploymentProvider({
      command_exists: () => false,
      is_authenticated: () => false
    });
    const sprite = new SpriteMicrovmDeploymentProvider({
      command_exists: () => false,
      is_authenticated: () => false
    });

    expect(
      fly.validate(
        fly.prepare(
          botManifest({
            target: { kind: "fly_machine", app_name: "openstrat-bot" }
          })
        )
      )
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["fly CLI unavailable", "fly auth unavailable"])
    });
    expect(
      sprite.validate(
        sprite.prepare(
          botManifest({
            target: { kind: "sprite_microvm", project: "openstrat" }
          })
        )
      )
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        "sprite CLI unavailable",
        "sprite auth unavailable"
      ])
    });
  });
});

const paperIntentStrategy = defineStrategy(sampleManifest(), (input) => {
  const lastEvent = input.market_events.at(-1);
  if (lastEvent?.kind !== "candle") {
    return [];
  }

  return [intent(lastEvent.candle.close_time)];
});

function botManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "bot_run_001",
    strategy_id: "sample",
    strategy_version: "0.1.0",
    deployment_gate_id: "gate_001",
    target: {
      kind: "local_terminal",
      workspace_path: "/tmp/openstrat",
      reliability_boundary:
        "Local execution depends on this machine staying awake, online, and authorized."
    },
    runtime: {
      mode: "paper",
      heartbeat_interval_ms: 1000,
      max_runtime_ms: 60_000,
      reliability_boundary_acknowledged: true
    },
    approval_refs: {
      strategy_manifest_ref: "strategies/sample/manifest.json",
      deployment_gate_ref: "gates/gate_001.json",
      backtest_report_ref: "backtests/run_001/report.json",
      risk_policy_ref: "risk/conservative_v1.json"
    },
    created_at: now,
    starts_at: now,
    ends_at: "2026-06-04T00:30:00.000Z",
    ...overrides
  };
}

function sampleManifest(): StrategyManifest {
  return {
    strategy_id: "sample",
    strategy_version: "0.1.0",
    name: "Sample",
    runtime: "typescript",
    entrypoint: "test",
    autonomy_mode: "strategy_workbench",
    allowed_symbols: ["BTC-PERP"],
    parameters: {},
    required_data: [{ kind: "candles", canonical_symbol: "BTC-PERP", interval: "15m" }],
    output: "trade_intent",
    created_at: now,
    source_refs: []
  };
}

function gate(): DeploymentGate {
  return {
    id: "gate_001",
    created_at: now,
    strategy_id: "sample",
    strategy_version: "0.1.0",
    backtest: {
      dataset_ref: "datasets/synthetic",
      min_win_rate: 0.55,
      min_trades: 1,
      max_drawdown_pct: 10,
      include_fees: true,
      include_slippage_model: true
    },
    deployment: {
      mode: "paper_trading",
      duration_hours: 1,
      max_notional_usd: 5000,
      max_daily_loss_usd: 350,
      kill_switch: false
    },
    required_reviews: ["risk"]
  };
}

function policy(overrides: Partial<RiskPolicy> = {}): RiskPolicy {
  return {
    id: "risk/conservative_v1",
    created_at: now,
    mode: "paper_trading",
    allowed_symbols: ["BTC-PERP"],
    max_notional_usd: 5000,
    max_leverage: 2,
    max_slippage_bps: 25,
    max_daily_loss_usd: 350,
    max_drawdown_pct: 12,
    min_liquidity_score: 0.2,
    stale_after_ms: 5000,
    require_evidence_refs: true,
    kill_switch: false,
    source_refs: [],
    ...overrides
  };
}

function market(): MarketRegistryEntry {
  return {
    canonical_symbol: "BTC-PERP",
    display_symbol: "BTC",
    venue_symbol: "BTC",
    venue: "hyperliquid",
    source: "hyperliquid",
    asset_class: "crypto",
    quote_token: "USDC",
    collateral_token: "USDC",
    max_leverage: 50,
    status: "active",
    liquidity_score: 0.95,
    last_verified_at: now,
    source_refs: ["raw/hyperliquid/meta.json"]
  };
}

function marketDatum(): MarketDatum {
  return {
    value: 100,
    source: "hyperliquid",
    venue: "hyperliquid",
    symbol: "BTC",
    canonical_symbol: "BTC-PERP",
    method: "mark",
    timestamp: now,
    received_at: now,
    stale_after_ms: 5000,
    raw_ref: "raw/hyperliquid/mark.json"
  };
}

function intent(createdAt: string): TradeIntent {
  return {
    id: `intent_${createdAt}`,
    created_at: createdAt,
    created_by: {
      strategy_id: "sample",
      strategy_version: "0.1.0"
    },
    mode: "paper",
    intent_type: "open_position",
    canonical_symbol: "BTC-PERP",
    side: "long",
    target_notional_usd: 1000,
    max_slippage_bps: 10,
    order_preference: { type: "market" },
    reason_ref: "decision/sample",
    evidence_refs: ["backtests/run_001/report.json"],
    risk_policy_ref: "risk/conservative_v1"
  };
}

function candle(openTime: string, close: number): Candle {
  const openMs = Date.parse(openTime);
  return {
    symbol: "BTC",
    canonical_symbol: "BTC-PERP",
    source: "synthetic",
    venue: "synthetic",
    interval: "15m",
    open_time: openTime,
    close_time: new Date(openMs + 15 * 60 * 1000 - 1).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    method: "derived",
    received_at: now,
    raw_ref: "raw/synthetic/candles.json"
  };
}
