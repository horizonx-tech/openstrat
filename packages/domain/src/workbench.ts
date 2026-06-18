import { z } from "zod";
import {
  CanonicalSymbolSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  SourceRefSchema
} from "./common.js";

export const WorkbenchLaunchModeSchema = z.enum([
  "interactive_tui",
  "headless_command"
]);

export const WorkbenchPrimaryInteractionSchema = z.enum([
  "natural_language",
  "headless_prompt"
]);

export const WorkbenchRuntimeCenterSchema = z.enum([
  "pi_extension_loop",
  "headless_cli"
]);

export const WorkbenchSlashCommandNameSchema = z.enum([
  "/markets",
  "/datasets",
  "/strategy",
  "/backtest",
  "/risk",
  "/deploy",
  "/status"
]);

export const WorkbenchSlashCommandSurfaceSchema = z.enum([
  "menu",
  "workspace",
  "status"
]);

export const WorkbenchWorkPhaseSchema = z.enum([
  "idle",
  "selecting_market",
  "inspecting_dataset",
  "drafting_strategy",
  "capturing_proposal",
  "validating_strategy",
  "running_backtest",
  "reviewing_diagnostics",
  "blocked",
  "complete"
]);

export const WorkbenchWorkStatusSchema = z.enum([
  "idle",
  "running",
  "blocked",
  "completed"
]);

export const WorkbenchSlashCommandSchema = z.object({
  name: WorkbenchSlashCommandNameSchema,
  purpose: NonEmptyStringSchema,
  surface: WorkbenchSlashCommandSurfaceSchema
});

export const WorkbenchSessionContractSchema = z
  .object({
    id: NonEmptyStringSchema,
    created_at: IsoDateTimeSchema,
    default_entrypoint: z.object({
      command: z.literal("openstrat"),
      mode: z.literal("interactive_tui")
    }),
    primary_interaction: z.literal("natural_language"),
    runtime_center: z.literal("pi_extension_loop"),
    project_status_ref: SourceRefSchema,
    slash_commands: z.array(WorkbenchSlashCommandSchema).min(1),
    headless_fallback_commands: z.array(NonEmptyStringSchema).min(1),
    visible_work_states: z.array(WorkbenchWorkPhaseSchema).min(1)
  })
  .superRefine((contract, ctx) => {
    const commandNames = new Set(
      contract.slash_commands.map((command) => command.name)
    );
    for (const required of WorkbenchSlashCommandNameSchema.options) {
      if (!commandNames.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `missing required slash command: ${required}`,
          path: ["slash_commands"]
        });
      }
    }
  });

export const WorkbenchArtifactRefsSchema = z
  .object({
    dataset_ref: SourceRefSchema.optional(),
    strategy_ref: SourceRefSchema.optional(),
    backtest_request_ref: SourceRefSchema.optional(),
    backtest_report_ref: SourceRefSchema.optional(),
    diagnostics_ref: SourceRefSchema.optional(),
    summary_ref: SourceRefSchema.optional(),
    gate_ref: SourceRefSchema.optional(),
    status_ref: SourceRefSchema.optional(),
    transcript_ref: SourceRefSchema.optional()
  })
  .superRefine((refs, ctx) => {
    if (Object.values(refs).every((value) => value === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "visible work state requires at least one artifact ref"
      });
    }
  });

export const WorkbenchVisibleWorkStateSchema = z.object({
  phase: WorkbenchWorkPhaseSchema,
  status: WorkbenchWorkStatusSchema,
  label: NonEmptyStringSchema,
  started_at: IsoDateTimeSchema.optional(),
  completed_at: IsoDateTimeSchema.optional(),
  artifact_refs: WorkbenchArtifactRefsSchema
});

export const WorkbenchSessionSummarySchema = z
  .object({
    id: NonEmptyStringSchema,
    session_id: NonEmptyStringSchema,
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
    selected_dataset_ref: SourceRefSchema.optional(),
    selected_symbol: CanonicalSymbolSchema.optional(),
    strategy_thesis: NonEmptyStringSchema.optional(),
    parameters: JsonRecordSchema.default({}),
    latest_backtest_report_ref: SourceRefSchema.optional(),
    diagnostics_ref: SourceRefSchema.optional(),
    rejected_ideas: z.array(NonEmptyStringSchema).default([]),
    risk_blockers: z.array(NonEmptyStringSchema).default([]),
    next_action: NonEmptyStringSchema,
    source_refs: z.array(SourceRefSchema).min(1)
  })
  .superRefine((summary, ctx) => {
    if (Date.parse(summary.updated_at) < Date.parse(summary.created_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "updated_at must be at or after created_at",
        path: ["updated_at"]
      });
    }
  });

export type WorkbenchLaunchMode = z.infer<typeof WorkbenchLaunchModeSchema>;
export type WorkbenchPrimaryInteraction = z.infer<
  typeof WorkbenchPrimaryInteractionSchema
>;
export type WorkbenchRuntimeCenter = z.infer<typeof WorkbenchRuntimeCenterSchema>;
export type WorkbenchSlashCommandName = z.infer<typeof WorkbenchSlashCommandNameSchema>;
export type WorkbenchSlashCommandSurface = z.infer<
  typeof WorkbenchSlashCommandSurfaceSchema
>;
export type WorkbenchWorkPhase = z.infer<typeof WorkbenchWorkPhaseSchema>;
export type WorkbenchWorkStatus = z.infer<typeof WorkbenchWorkStatusSchema>;
export type WorkbenchSlashCommand = z.infer<typeof WorkbenchSlashCommandSchema>;
export type WorkbenchSessionContract = z.infer<typeof WorkbenchSessionContractSchema>;
export type WorkbenchArtifactRefs = z.infer<typeof WorkbenchArtifactRefsSchema>;
export type WorkbenchVisibleWorkState = z.infer<typeof WorkbenchVisibleWorkStateSchema>;
export type WorkbenchSessionSummary = z.infer<typeof WorkbenchSessionSummarySchema>;
