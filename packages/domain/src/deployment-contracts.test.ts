import { describe, expect, it } from "vitest";
import {
  BotHeartbeatSchema,
  BotLifecycleEventSchema,
  BotRunManifestSchema,
  BotRunSummarySchema,
  BotRuntimeConfigSchema,
  DeploymentTargetSchema
} from "./index.js";

const now = "2026-06-04T00:00:00.000Z";

describe("deployment domain contracts", () => {
  it("supports local_terminal, fly_machine, and sprite_microvm deployment targets", () => {
    expect(
      DeploymentTargetSchema.safeParse({
        kind: "local_terminal",
        workspace_path: "/tmp/openstrat",
        reliability_boundary:
          "Local execution depends on this machine staying awake, online, and authorized."
      }).success
    ).toBe(true);
    expect(
      DeploymentTargetSchema.safeParse({
        kind: "fly_machine",
        app_name: "openstrat-bot",
        region: "iad"
      }).success
    ).toBe(true);
    expect(
      DeploymentTargetSchema.safeParse({
        kind: "sprite_microvm",
        project: "openstrat",
        image: "registry.example/openstrat-bot:latest"
      }).success
    ).toBe(true);
  });

  it("requires approved manifest refs in BotRunManifest", () => {
    const valid = BotRunManifestSchema.safeParse({
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
      ends_at: "2026-06-04T00:01:00.000Z"
    });

    expect(valid.success).toBe(true);
    expect(
      BotRunManifestSchema.safeParse({
        id: "bot_run_001",
        strategy_id: "sample",
        strategy_version: "0.1.0",
        deployment_gate_id: "gate_001",
        target: { kind: "local_terminal", workspace_path: "/tmp/openstrat" },
        runtime: {
          mode: "paper",
          heartbeat_interval_ms: 1000,
          max_runtime_ms: 60_000,
          reliability_boundary_acknowledged: true
        },
        approval_refs: {
          strategy_manifest_ref: "strategies/sample/manifest.json",
          deployment_gate_ref: "gates/gate_001.json"
        },
        created_at: now,
        ends_at: "2026-06-04T00:01:00.000Z"
      }).success
    ).toBe(false);
  });

  it("validates runtime heartbeat, lifecycle, and summary artifacts", () => {
    expect(
      BotRuntimeConfigSchema.safeParse({
        mode: "paper",
        heartbeat_interval_ms: 1000,
        max_runtime_ms: 60_000,
        reliability_boundary_acknowledged: true
      }).success
    ).toBe(true);
    expect(
      BotHeartbeatSchema.safeParse({
        bot_run_id: "bot_run_001",
        sequence: 1,
        timestamp: now,
        status: "running",
        target_kind: "local_terminal",
        event_stream_id: "bot_runs/bot_run_001"
      }).success
    ).toBe(true);
    expect(
      BotLifecycleEventSchema.safeParse({
        bot_run_id: "bot_run_001",
        timestamp: now,
        type: "heartbeat",
        message: "tick",
        payload: { sequence: 1 }
      }).success
    ).toBe(true);
    expect(
      BotRunSummarySchema.safeParse({
        bot_run_id: "bot_run_001",
        status: "completed",
        started_at: now,
        ended_at: "2026-06-04T00:01:00.000Z",
        heartbeats: 2,
        intents_emitted: 1,
        risk_reviews: 1,
        stop_reason: "duration_expired",
        event_stream_id: "bot_runs/bot_run_001",
        reliability_boundary:
          "Local execution depends on this machine staying awake, online, and authorized."
      }).success
    ).toBe(true);
  });
});
