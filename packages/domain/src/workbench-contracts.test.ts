import { describe, expect, it } from "vitest";
import {
  WorkbenchSessionContractSchema,
  WorkbenchSessionSummarySchema,
  WorkbenchVisibleWorkStateSchema
} from "./index.js";

const now = "2026-06-18T00:00:00.000Z";

describe("interactive workbench contracts", () => {
  it("makes interactive natural-language TUI the default product entrypoint", () => {
    const contract = WorkbenchSessionContractSchema.parse({
      id: "openstrat-default-workbench",
      created_at: now,
      default_entrypoint: {
        command: "openstrat",
        mode: "interactive_tui"
      },
      primary_interaction: "natural_language",
      runtime_center: "pi_extension_loop",
      project_status_ref: "projects/project_001/status/latest.json",
      slash_commands: [
        { name: "/markets", purpose: "Select or inspect markets.", surface: "menu" },
        { name: "/datasets", purpose: "Inspect available datasets.", surface: "menu" },
        {
          name: "/strategy",
          purpose: "Inspect or propose strategy changes.",
          surface: "workspace"
        },
        {
          name: "/backtest",
          purpose: "Run or inspect backtests.",
          surface: "workspace"
        },
        { name: "/risk", purpose: "Inspect risk gates.", surface: "workspace" },
        {
          name: "/deploy",
          purpose: "Inspect deployment readiness.",
          surface: "workspace"
        },
        { name: "/status", purpose: "Show project state.", surface: "status" }
      ],
      headless_fallback_commands: [
        "openstrat markets ingest",
        "openstrat workbench run --prompt",
        "openstrat project status --json"
      ],
      visible_work_states: [
        "selecting_market",
        "inspecting_dataset",
        "drafting_strategy",
        "validating_strategy",
        "running_backtest",
        "reviewing_diagnostics"
      ]
    });

    expect(contract.default_entrypoint.mode).toBe("interactive_tui");
    expect(contract.primary_interaction).toBe("natural_language");
    expect(contract.slash_commands.map((command) => command.name)).toEqual(
      expect.arrayContaining([
        "/markets",
        "/datasets",
        "/strategy",
        "/backtest",
        "/risk",
        "/deploy",
        "/status"
      ])
    );
    expect(
      WorkbenchSessionContractSchema.safeParse({
        ...contract,
        default_entrypoint: {
          command: "openstrat workbench run",
          mode: "headless_command"
        }
      }).success
    ).toBe(false);
    expect(
      WorkbenchSessionContractSchema.safeParse({
        ...contract,
        primary_interaction: "headless_prompt"
      }).success
    ).toBe(false);
  });

  it("captures visible work state with durable artifact refs", () => {
    const state = WorkbenchVisibleWorkStateSchema.parse({
      phase: "running_backtest",
      status: "running",
      label: "Running backtest",
      started_at: now,
      artifact_refs: {
        dataset_ref: "datasets/hyperliquid/ETH-PERP/2026-06-18T00-00-00.000Z.json",
        strategy_ref: "projects/project_001/strategies/eth_momentum/manifest.json",
        backtest_request_ref:
          "projects/project_001/backtests/workbench_backtest_001/request.json"
      }
    });

    expect(state.phase).toBe("running_backtest");
    expect(state.artifact_refs.dataset_ref).toContain("datasets/hyperliquid");
    expect(
      WorkbenchVisibleWorkStateSchema.safeParse({
        ...state,
        artifact_refs: {}
      }).success
    ).toBe(false);
  });

  it("stores semantic session summaries instead of relying only on generic compaction", () => {
    const summary = WorkbenchSessionSummarySchema.parse({
      id: "workbench_summary_001",
      session_id: "agent_session_001",
      created_at: now,
      updated_at: now,
      selected_dataset_ref:
        "datasets/hyperliquid/ETH-PERP/2026-06-18T00-00-00.000Z.json",
      selected_symbol: "ETH-PERP",
      strategy_thesis: "Trade momentum only after confirming dataset freshness.",
      parameters: {
        interval: "15m",
        target_notional_usd: 1000
      },
      latest_backtest_report_ref:
        "projects/project_001/backtests/workbench_backtest_001/report.json",
      diagnostics_ref:
        "projects/project_001/backtests/workbench_backtest_001/diagnostics.json",
      rejected_ideas: ["Do not infer signal quality from mark price alone."],
      risk_blockers: ["Risk review required before deployment."],
      next_action: "Revise the strategy against the latest diagnostics.",
      source_refs: [
        "projects/project_001/status/latest.json",
        "projects/project_001/backtests/workbench_backtest_001/report.json"
      ]
    });

    expect(summary.strategy_thesis).toContain("dataset freshness");
    expect(summary.source_refs).toHaveLength(2);
    expect(
      WorkbenchSessionSummarySchema.safeParse({
        ...summary,
        source_refs: []
      }).success
    ).toBe(false);
  });
});
