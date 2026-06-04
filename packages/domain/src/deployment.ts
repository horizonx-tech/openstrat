import { z } from "zod";
import {
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  PositiveFiniteSchema,
  SourceRefSchema
} from "./common.js";

export const DeploymentTargetKindSchema = z.enum([
  "local_terminal",
  "fly_machine",
  "sprite_microvm"
]);

export const DeploymentTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local_terminal"),
    workspace_path: NonEmptyStringSchema,
    reliability_boundary: NonEmptyStringSchema
  }),
  z.object({
    kind: z.literal("fly_machine"),
    app_name: NonEmptyStringSchema,
    region: NonEmptyStringSchema.optional()
  }),
  z.object({
    kind: z.literal("sprite_microvm"),
    project: NonEmptyStringSchema,
    image: NonEmptyStringSchema.optional()
  })
]);

export const BotRuntimeModeSchema = z.enum(["paper", "draft", "live"]);

export const BotRuntimeConfigSchema = z.object({
  mode: BotRuntimeModeSchema,
  heartbeat_interval_ms: z.number().int().positive(),
  max_runtime_ms: PositiveFiniteSchema,
  reliability_boundary_acknowledged: z.boolean()
});

export const BotRunApprovalRefsSchema = z.object({
  strategy_manifest_ref: SourceRefSchema,
  deployment_gate_ref: SourceRefSchema,
  backtest_report_ref: SourceRefSchema,
  risk_policy_ref: SourceRefSchema
});

export const BotRunManifestSchema = z
  .object({
    id: NonEmptyStringSchema,
    strategy_id: NonEmptyStringSchema,
    strategy_version: NonEmptyStringSchema,
    deployment_gate_id: NonEmptyStringSchema,
    target: DeploymentTargetSchema,
    runtime: BotRuntimeConfigSchema,
    approval_refs: BotRunApprovalRefsSchema,
    created_at: IsoDateTimeSchema,
    starts_at: IsoDateTimeSchema.optional(),
    ends_at: IsoDateTimeSchema
  })
  .superRefine((manifest, ctx) => {
    if (
      Date.parse(manifest.ends_at) <=
      Date.parse(manifest.starts_at ?? manifest.created_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ends_at must be after starts_at or created_at",
        path: ["ends_at"]
      });
    }
    if (
      manifest.target.kind === "local_terminal" &&
      manifest.runtime.reliability_boundary_acknowledged !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "local_terminal runs require reliability boundary acknowledgement",
        path: ["runtime", "reliability_boundary_acknowledged"]
      });
    }
  });

export const BotRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "stopped"
]);

export const BotHeartbeatSchema = z.object({
  bot_run_id: NonEmptyStringSchema,
  sequence: z.number().int().positive(),
  timestamp: IsoDateTimeSchema,
  status: BotRunStatusSchema,
  target_kind: DeploymentTargetKindSchema,
  event_stream_id: NonEmptyStringSchema
});

export const BotLifecycleEventTypeSchema = z.enum([
  "created",
  "started",
  "heartbeat",
  "intent_emitted",
  "risk_reviewed",
  "paper_intent_recorded",
  "duration_expired",
  "manual_stop_requested",
  "kill_switch_triggered",
  "completed",
  "failed"
]);

export const BotLifecycleEventSchema = z.object({
  bot_run_id: NonEmptyStringSchema,
  timestamp: IsoDateTimeSchema,
  type: BotLifecycleEventTypeSchema,
  message: NonEmptyStringSchema.optional(),
  payload: JsonRecordSchema.optional()
});

export const BotRunSummarySchema = z.object({
  bot_run_id: NonEmptyStringSchema,
  status: BotRunStatusSchema,
  started_at: IsoDateTimeSchema,
  ended_at: IsoDateTimeSchema,
  heartbeats: z.number().int().min(0),
  intents_emitted: z.number().int().min(0),
  risk_reviews: z.number().int().min(0),
  stop_reason: z.enum([
    "completed",
    "duration_expired",
    "manual_stop",
    "kill_switch",
    "failed"
  ]),
  event_stream_id: NonEmptyStringSchema,
  reliability_boundary: NonEmptyStringSchema
});

export type DeploymentTargetKind = z.infer<typeof DeploymentTargetKindSchema>;
export type DeploymentTarget = z.infer<typeof DeploymentTargetSchema>;
export type BotRuntimeMode = z.infer<typeof BotRuntimeModeSchema>;
export type BotRuntimeConfig = z.infer<typeof BotRuntimeConfigSchema>;
export type BotRunApprovalRefs = z.infer<typeof BotRunApprovalRefsSchema>;
export type BotRunManifest = z.infer<typeof BotRunManifestSchema>;
export type BotRunStatus = z.infer<typeof BotRunStatusSchema>;
export type BotHeartbeat = z.infer<typeof BotHeartbeatSchema>;
export type BotLifecycleEventType = z.infer<typeof BotLifecycleEventTypeSchema>;
export type BotLifecycleEvent = z.infer<typeof BotLifecycleEventSchema>;
export type BotRunSummary = z.infer<typeof BotRunSummarySchema>;
