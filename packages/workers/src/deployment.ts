import {
  BotHeartbeatSchema,
  BotRunManifestSchema,
  BotRunSummarySchema,
  type BotRunManifest,
  type BotRunSummary,
  type DeploymentGate,
  type DeploymentTargetKind,
  type MarketDatum,
  type MarketRegistryEntry,
  type RiskPolicy,
  type RiskReview,
  type StrategyManifest
} from "@openstrat/domain";
import type { EventLogRepository } from "@openstrat/persistence";
import { validateTradeIntentRisk } from "@openstrat/risk";
import {
  createStrategyRunner,
  type StrategyMarketEvent,
  type StrategyModule
} from "@openstrat/strategy-sdk";

const LOCAL_RELIABILITY_BOUNDARY =
  "Local execution depends on this machine staying awake, online, and authorized.";

const DEPLOYMENT_GUARANTEES = [
  "approved_manifest_required",
  "risk_gate_required",
  "event_logging_required",
  "heartbeat_required",
  "duration_enforced",
  "kill_switch_enforced",
  "user_owned_credentials_only"
] as const;

export interface LocalBotRunRequest {
  manifest: unknown;
  strategy: StrategyModule;
  strategy_manifest: StrategyManifest;
  deployment_gate: DeploymentGate;
  risk_policy: RiskPolicy;
  market: MarketRegistryEntry;
  latest_market_data: MarketDatum;
  market_events: StrategyMarketEvent[];
  event_log: EventLogRepository;
  should_stop?: (state: { tick_index: number }) => boolean;
  estimated_slippage_bps?: number;
  current_drawdown_pct?: number;
  current_daily_loss_usd?: number;
}

export interface DeploymentPlan {
  provider_kind: DeploymentTargetKind;
  target_kind: DeploymentTargetKind;
  bot_run_id: string;
  target: BotRunManifest["target"];
  actions: string[];
  guarantees: string[];
  remote: boolean;
  required_cli?: string;
  auth_required: boolean;
}

export interface DeploymentProviderValidation {
  ok: boolean;
  errors: string[];
}

export interface DeploymentLaunchResult {
  launched: boolean;
  remote: boolean;
  plan: DeploymentPlan;
  summary?: BotRunSummary;
  reason?: string;
}

export interface DeploymentProvider {
  readonly kind: DeploymentTargetKind;
  prepare(manifest: unknown): DeploymentPlan;
  validate(plan: DeploymentPlan): DeploymentProviderValidation;
  launch(
    plan: DeploymentPlan,
    request?: LocalBotRunRequest
  ): Promise<DeploymentLaunchResult>;
}

export interface ProviderEnvironment {
  command_exists(command: string): boolean;
  is_authenticated(provider: DeploymentTargetKind): boolean;
}

export async function runLocalBot(request: LocalBotRunRequest): Promise<BotRunSummary> {
  const manifest = parseManifest(request.manifest);
  const eventStreamId = `bot_runs/${manifest.id}`;
  const startedAt = manifest.starts_at ?? manifest.created_at;
  const reliabilityBoundary =
    manifest.target.kind === "local_terminal"
      ? manifest.target.reliability_boundary
      : LOCAL_RELIABILITY_BOUNDARY;

  validateApprovalArtifacts(manifest, request);

  appendLifecycle(request.event_log, eventStreamId, manifest.id, startedAt, "started", {
    reliability_boundary: reliabilityBoundary,
    target_kind: manifest.target.kind
  });

  if (
    request.risk_policy.kill_switch ||
    request.deployment_gate.deployment.kill_switch
  ) {
    appendLifecycle(
      request.event_log,
      eventStreamId,
      manifest.id,
      startedAt,
      "kill_switch_triggered",
      { policy_id: request.risk_policy.id }
    );
    return summary({
      manifest,
      status: "stopped",
      started_at: startedAt,
      ended_at: startedAt,
      heartbeats: 0,
      intents_emitted: 0,
      risk_reviews: 0,
      stop_reason: "kill_switch",
      event_stream_id: eventStreamId,
      reliability_boundary: reliabilityBoundary
    });
  }

  if (request.should_stop?.({ tick_index: 0 }) === true) {
    appendLifecycle(
      request.event_log,
      eventStreamId,
      manifest.id,
      startedAt,
      "manual_stop_requested",
      {}
    );
    return summary({
      manifest,
      status: "stopped",
      started_at: startedAt,
      ended_at: startedAt,
      heartbeats: 0,
      intents_emitted: 0,
      risk_reviews: 0,
      stop_reason: "manual_stop",
      event_stream_id: eventStreamId,
      reliability_boundary: reliabilityBoundary
    });
  }

  const runner = createStrategyRunner();
  const eventsSoFar: StrategyMarketEvent[] = [];
  let heartbeats = 0;
  let intentsEmitted = 0;
  let riskReviews = 0;
  let endedAt = startedAt;

  for (const [index, marketEvent] of request.market_events.entries()) {
    const eventTime = eventTimestamp(marketEvent);
    if (Date.parse(eventTime) >= Date.parse(manifest.ends_at)) {
      appendLifecycle(
        request.event_log,
        eventStreamId,
        manifest.id,
        eventTime,
        "duration_expired",
        { tick_index: index }
      );
      return summary({
        manifest,
        status: "stopped",
        started_at: startedAt,
        ended_at: eventTime,
        heartbeats,
        intents_emitted: intentsEmitted,
        risk_reviews: riskReviews,
        stop_reason: "duration_expired",
        event_stream_id: eventStreamId,
        reliability_boundary: reliabilityBoundary
      });
    }

    if (request.should_stop?.({ tick_index: index }) === true) {
      appendLifecycle(
        request.event_log,
        eventStreamId,
        manifest.id,
        eventTime,
        "manual_stop_requested",
        { tick_index: index }
      );
      return summary({
        manifest,
        status: "stopped",
        started_at: startedAt,
        ended_at: eventTime,
        heartbeats,
        intents_emitted: intentsEmitted,
        risk_reviews: riskReviews,
        stop_reason: "manual_stop",
        event_stream_id: eventStreamId,
        reliability_boundary: reliabilityBoundary
      });
    }

    heartbeats += 1;
    appendHeartbeat(request.event_log, eventStreamId, manifest, heartbeats, eventTime);
    eventsSoFar.push(marketEvent);

    const strategyResult = await runner.evaluate(request.strategy, {
      now: eventTime,
      mode: manifest.runtime.mode,
      risk_policy_ref: request.risk_policy.id,
      decision_ref: `${eventStreamId}/tick/${heartbeats}`,
      market_events: eventsSoFar
    });

    for (const intent of strategyResult.intents) {
      intentsEmitted += 1;
      request.event_log.append({
        stream_id: eventStreamId,
        type: "bot.intent.emitted",
        occurred_at: eventTime,
        payload: {
          bot_run_id: manifest.id,
          intent
        }
      });

      const review = validateTradeIntentRisk(intent, request.risk_policy, {
        now: eventTime,
        review_id: `${manifest.id}:risk_review:${riskReviews + 1}`,
        market: request.market,
        latest_market_data: request.latest_market_data,
        estimated_slippage_bps:
          request.estimated_slippage_bps ?? intent.max_slippage_bps,
        current_drawdown_pct: request.current_drawdown_pct ?? 0,
        current_daily_loss_usd: request.current_daily_loss_usd ?? 0
      });
      riskReviews += 1;
      appendRiskReview(
        request.event_log,
        eventStreamId,
        manifest.id,
        eventTime,
        review
      );

      if (manifest.runtime.mode === "paper" && review.status === "approved") {
        request.event_log.append({
          stream_id: eventStreamId,
          type: "bot.paper.intent_recorded",
          occurred_at: eventTime,
          payload: {
            bot_run_id: manifest.id,
            intent_id: intent.id
          }
        });
      }
    }

    endedAt = eventTime;
  }

  appendLifecycle(
    request.event_log,
    eventStreamId,
    manifest.id,
    endedAt,
    "completed",
    {}
  );
  return summary({
    manifest,
    status: "completed",
    started_at: startedAt,
    ended_at: endedAt,
    heartbeats,
    intents_emitted: intentsEmitted,
    risk_reviews: riskReviews,
    stop_reason: "completed",
    event_stream_id: eventStreamId,
    reliability_boundary: reliabilityBoundary
  });
}

export class LocalTerminalDeploymentProvider implements DeploymentProvider {
  readonly kind = "local_terminal" as const;

  prepare(manifestInput: unknown): DeploymentPlan {
    const manifest = parseManifest(manifestInput);
    if (manifest.target.kind !== this.kind) {
      throw new Error("local_terminal provider requires local_terminal target");
    }
    return planFor(manifest, {
      actions: [
        "validate approval refs",
        "start local terminal runner",
        "write append-only lifecycle events"
      ],
      auth_required: false,
      provider_kind: this.kind,
      remote: false
    });
  }

  validate(_plan: DeploymentPlan): DeploymentProviderValidation {
    return { ok: true, errors: [] };
  }

  async launch(
    plan: DeploymentPlan,
    request?: LocalBotRunRequest
  ): Promise<DeploymentLaunchResult> {
    if (request === undefined) {
      return {
        launched: false,
        remote: false,
        plan,
        reason: "local launch requires LocalBotRunRequest"
      };
    }

    const validation = this.validate(plan);
    if (!validation.ok) {
      return {
        launched: false,
        remote: false,
        plan,
        reason: validation.errors.join("; ")
      };
    }

    return {
      launched: true,
      remote: false,
      plan,
      summary: await runLocalBot(request)
    };
  }
}

export class FlyMachineDeploymentProvider implements DeploymentProvider {
  readonly kind = "fly_machine" as const;

  constructor(
    private readonly environment: ProviderEnvironment = unavailableEnvironment
  ) {}

  prepare(manifestInput: unknown): DeploymentPlan {
    const manifest = parseManifest(manifestInput);
    if (manifest.target.kind !== this.kind) {
      throw new Error("fly_machine provider requires fly_machine target");
    }
    return planFor(manifest, {
      actions: [
        "validate approval refs",
        "check fly CLI",
        "check fly auth",
        "render Fly Machine launch plan"
      ],
      auth_required: true,
      provider_kind: this.kind,
      remote: true,
      required_cli: "fly"
    });
  }

  validate(plan: DeploymentPlan): DeploymentProviderValidation {
    const errors: string[] = [];
    if (!this.environment.command_exists(plan.required_cli ?? "fly")) {
      errors.push("fly CLI unavailable");
    }
    if (!this.environment.is_authenticated(this.kind)) {
      errors.push("fly auth unavailable");
    }
    return { ok: errors.length === 0, errors };
  }

  async launch(plan: DeploymentPlan): Promise<DeploymentLaunchResult> {
    return {
      launched: false,
      remote: true,
      plan,
      reason: "fly_machine remote launch is plan-only in this slice"
    };
  }
}

export class SpriteMicrovmDeploymentProvider implements DeploymentProvider {
  readonly kind = "sprite_microvm" as const;

  constructor(
    private readonly environment: ProviderEnvironment = unavailableEnvironment
  ) {}

  prepare(manifestInput: unknown): DeploymentPlan {
    const manifest = parseManifest(manifestInput);
    if (manifest.target.kind !== this.kind) {
      throw new Error("sprite_microvm provider requires sprite_microvm target");
    }
    return planFor(manifest, {
      actions: [
        "validate approval refs",
        "check sprite CLI",
        "check sprite auth",
        "render Sprite microVM launch plan"
      ],
      auth_required: true,
      provider_kind: this.kind,
      remote: true,
      required_cli: "sprite"
    });
  }

  validate(plan: DeploymentPlan): DeploymentProviderValidation {
    const errors: string[] = [];
    if (!this.environment.command_exists(plan.required_cli ?? "sprite")) {
      errors.push("sprite CLI unavailable");
    }
    if (!this.environment.is_authenticated(this.kind)) {
      errors.push("sprite auth unavailable");
    }
    return { ok: errors.length === 0, errors };
  }

  async launch(plan: DeploymentPlan): Promise<DeploymentLaunchResult> {
    return {
      launched: false,
      remote: true,
      plan,
      reason: "sprite_microvm remote launch is plan-only in this slice"
    };
  }
}

function parseManifest(input: unknown): BotRunManifest {
  const parsed = BotRunManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("BotRunManifest approval artifacts are required and valid");
  }
  return parsed.data;
}

function validateApprovalArtifacts(
  manifest: BotRunManifest,
  request: LocalBotRunRequest
): void {
  if (manifest.target.kind !== "local_terminal") {
    throw new Error("Local bot runner only supports local_terminal target");
  }
  if (manifest.runtime.mode !== "paper") {
    throw new Error("Local bot runner only implements paper-mode execution");
  }
  if (
    manifest.strategy_id !== request.strategy_manifest.strategy_id ||
    manifest.strategy_version !== request.strategy_manifest.strategy_version
  ) {
    throw new Error("BotRunManifest does not match approved StrategyManifest");
  }
  if (manifest.deployment_gate_id !== request.deployment_gate.id) {
    throw new Error("BotRunManifest does not match approved DeploymentGate");
  }
  if (
    request.deployment_gate.strategy_id !== request.strategy_manifest.strategy_id ||
    request.deployment_gate.strategy_version !==
      request.strategy_manifest.strategy_version
  ) {
    throw new Error("DeploymentGate does not match StrategyManifest");
  }
}

function appendHeartbeat(
  eventLog: EventLogRepository,
  streamId: string,
  manifest: BotRunManifest,
  sequence: number,
  timestamp: string
): void {
  const heartbeat = BotHeartbeatSchema.parse({
    bot_run_id: manifest.id,
    sequence,
    timestamp,
    status: "running",
    target_kind: manifest.target.kind,
    event_stream_id: streamId
  });

  eventLog.append({
    stream_id: streamId,
    type: "bot.heartbeat",
    occurred_at: timestamp,
    payload: heartbeat
  });
}

function appendRiskReview(
  eventLog: EventLogRepository,
  streamId: string,
  botRunId: string,
  timestamp: string,
  review: RiskReview
): void {
  eventLog.append({
    stream_id: streamId,
    type: "bot.risk.reviewed",
    occurred_at: timestamp,
    payload: {
      bot_run_id: botRunId,
      review
    }
  });
}

function appendLifecycle(
  eventLog: EventLogRepository,
  streamId: string,
  botRunId: string,
  timestamp: string,
  type:
    | "started"
    | "duration_expired"
    | "manual_stop_requested"
    | "kill_switch_triggered"
    | "completed"
    | "failed",
  payload: Record<string, unknown>
): void {
  eventLog.append({
    stream_id: streamId,
    type: `bot.lifecycle.${type}`,
    occurred_at: timestamp,
    payload: {
      bot_run_id: botRunId,
      timestamp,
      type,
      payload
    }
  });
}

function eventTimestamp(event: StrategyMarketEvent): string {
  switch (event.kind) {
    case "candle":
      return event.candle.open_time;
    case "market_datum":
      return event.datum.received_at;
    case "funding_rate":
      return event.funding_rate.timestamp;
    case "orderbook":
      return event.orderbook.timestamp;
  }
}

function summary(input: {
  manifest: BotRunManifest;
  status: "completed" | "failed" | "stopped";
  started_at: string;
  ended_at: string;
  heartbeats: number;
  intents_emitted: number;
  risk_reviews: number;
  stop_reason:
    "completed" | "duration_expired" | "manual_stop" | "kill_switch" | "failed";
  event_stream_id: string;
  reliability_boundary: string;
}): BotRunSummary {
  return BotRunSummarySchema.parse({
    bot_run_id: input.manifest.id,
    status: input.status,
    started_at: input.started_at,
    ended_at: input.ended_at,
    heartbeats: input.heartbeats,
    intents_emitted: input.intents_emitted,
    risk_reviews: input.risk_reviews,
    stop_reason: input.stop_reason,
    event_stream_id: input.event_stream_id,
    reliability_boundary: input.reliability_boundary
  });
}

function planFor(
  manifest: BotRunManifest,
  options: {
    actions: string[];
    auth_required: boolean;
    provider_kind: DeploymentTargetKind;
    remote: boolean;
    required_cli?: string;
  }
): DeploymentPlan {
  const plan: DeploymentPlan = {
    provider_kind: options.provider_kind,
    target_kind: manifest.target.kind,
    bot_run_id: manifest.id,
    target: manifest.target,
    actions: options.actions,
    guarantees: [...DEPLOYMENT_GUARANTEES],
    remote: options.remote,
    auth_required: options.auth_required
  };
  if (options.required_cli !== undefined) {
    plan.required_cli = options.required_cli;
  }
  return plan;
}

const unavailableEnvironment: ProviderEnvironment = {
  command_exists: () => false,
  is_authenticated: () => false
};
