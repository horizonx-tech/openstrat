import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  BacktestRequestSchema,
  DeploymentGateSchema,
  MemoryProposalSchema,
  OPENSTRAT_CODEX_BASELINE_CONTRACT,
  RiskReviewSchema,
  RiskPolicySchema,
  StrategyPatchProposalSchema,
  TradeIntentSchema,
  type Candle,
  type MarketDatum,
  type MarketRegistryEntry,
  type OrderbookSnapshot,
  type RiskPolicy,
  type RiskReview,
  type TradeIntent
} from "@openstrat/domain";
import type { MarketDataReader } from "@openstrat/market-data";
import { FileObjectStore, SqliteEventLog } from "@openstrat/persistence";
import type { RiskContext, RiskPolicyEngine } from "@openstrat/risk";
import {
  createAgentToolGateway,
  type AgentToolGatewayToolName
} from "@openstrat/workers";
import { z } from "zod";
import { ensureOpenStratCliHome, resolveOpenStratCliHome } from "./home.js";

export interface OpenStratMcpToolOutput {
  [key: string]: unknown;
  status: "completed" | "failed";
  canonical_tool_name: AgentToolGatewayToolName;
  result?: unknown;
  error?: string;
}

export async function runOpenStratMcpServer(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd()
): Promise<void> {
  const home = resolveOpenStratCliHome({ cwd, env });
  ensureOpenStratCliHome(home);
  const server = new McpServer(
    {
      name: "openstrat",
      version: "0.0.0"
    },
    {
      instructions:
        "OpenStrat exposes trading-strategy workbench tools. Generated strategy code must use OpenStrat strategy contracts and must not call exchanges directly."
    }
  );

  for (const tool of OPENSTRAT_CODEX_BASELINE_CONTRACT.openstrat_tools) {
    server.registerTool(
      tool.name.replaceAll(".", "_"),
      {
        description: `${tool.name}: ${tool.capability} (${tool.side_effect})`,
        inputSchema: z.object({}).passthrough()
      },
      async (args) => {
        const output = await invokeOpenStratMcpTool(
          tool.name as AgentToolGatewayToolName,
          args,
          env,
          cwd
        );
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output
        };
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function invokeOpenStratMcpTool(
  toolName: AgentToolGatewayToolName,
  args: Record<string, unknown>,
  env: Record<string, string | undefined>,
  cwd: string
): Promise<OpenStratMcpToolOutput> {
  const home = resolveOpenStratCliHome({ cwd, env });
  ensureOpenStratCliHome(home);
  const events = new SqliteEventLog(home.stateDbPath);
  const objects = new FileObjectStore(`${home.projectRoot}/objects`);
  const gateway = createAgentToolGateway({
    events,
    objects,
    marketData: new EmptyMarketDataReader(),
    risk: new UnavailableRiskEngine(),
    now: () => new Date().toISOString()
  });
  const base = invocationBase(args);

  try {
    switch (toolName) {
      case "market_data.read_snapshot":
        return completed(
          toolName,
          await gateway.readMarketDataSnapshot({
            ...base,
            canonical_symbol: stringArg(args, "canonical_symbol")
          })
        );
      case "backtest.request":
        return completed(
          toolName,
          await gateway.captureBacktestRequest({
            ...base,
            request: BacktestRequestSchema.parse(requiredRecord(args, "request"))
          })
        );
      case "risk.validate_intent":
        return completed(
          toolName,
          await gateway.validateRisk({
            ...base,
            intent: TradeIntentSchema.parse(requiredRecord(args, "intent")),
            policy: RiskPolicySchema.parse(requiredRecord(args, "policy")),
            context: riskContextArg(args, "context")
          })
        );
      case "strategy_patch.capture":
        return completed(
          toolName,
          await gateway.captureStrategyPatchProposal({
            ...base,
            proposal: StrategyPatchProposalSchema.parse(
              requiredRecord(args, "proposal")
            )
          })
        );
      case "memory_proposal.capture":
        return completed(
          toolName,
          await gateway.captureMemoryProposal({
            ...base,
            proposal: MemoryProposalSchema.parse(requiredRecord(args, "proposal"))
          })
        );
      case "deployment_gate.inspect":
        return completed(
          toolName,
          await gateway.inspectDeploymentGate({
            ...base,
            gate: DeploymentGateSchema.parse(requiredRecord(args, "gate"))
          })
        );
    }
  } catch (error) {
    return {
      status: "failed",
      canonical_tool_name: toolName,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    events.close();
  }
}

function completed(
  toolName: AgentToolGatewayToolName,
  result: unknown
): OpenStratMcpToolOutput {
  return {
    status: "completed",
    canonical_tool_name: toolName,
    result
  };
}

function invocationBase(args: Record<string, unknown>): {
  call_id: string;
  session_id: string;
  turn_id: string;
} {
  return {
    call_id: optionalStringArg(args, "call_id") ?? `mcp_call_${Date.now()}`,
    session_id: optionalStringArg(args, "session_id") ?? "mcp_session",
    turn_id: optionalStringArg(args, "turn_id") ?? "mcp_turn"
  };
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = optionalStringArg(args, name);
  if (!value) {
    throw new Error(`Missing string argument: ${name}`);
  }
  return value;
}

function optionalStringArg(
  args: Record<string, unknown>,
  name: string
): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requiredRecord(
  args: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  const value = args[name];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Missing object argument: ${name}`);
  }
  return value as Record<string, unknown>;
}

function riskContextArg(args: Record<string, unknown>, name: string): RiskContext {
  const value = requiredRecord(args, name);
  if (
    !Array.isArray(value.market_refs) ||
    value.market_refs.some((ref) => typeof ref !== "string")
  ) {
    throw new Error(`Missing string array argument: ${name}.market_refs`);
  }
  return {
    market_refs: value.market_refs,
    ...(typeof value.portfolio_ref === "string"
      ? { portfolio_ref: value.portfolio_ref }
      : {}),
    ...(typeof value.decision_ref === "string"
      ? { decision_ref: value.decision_ref }
      : {})
  };
}

class EmptyMarketDataReader implements MarketDataReader {
  async getMarket(_canonicalSymbol: string): Promise<MarketRegistryEntry | undefined> {
    return undefined;
  }

  async getLatestPrice(_query: unknown): Promise<MarketDatum> {
    throw new Error("project market data reader is not wired yet");
  }

  async getCandles(_query: unknown): Promise<Candle[]> {
    return [];
  }

  async getOrderbookSnapshot(_query: unknown): Promise<OrderbookSnapshot> {
    throw new Error("project orderbook reader is not wired yet");
  }
}

class UnavailableRiskEngine implements RiskPolicyEngine {
  async review(
    intent: TradeIntent,
    policy: RiskPolicy,
    _context: RiskContext
  ): Promise<RiskReview> {
    return RiskReviewSchema.parse({
      id: `${intent.id}:${policy.id}:unavailable`,
      intent_id: intent.id,
      policy_id: policy.id,
      created_at: new Date().toISOString(),
      status: "simulation_required",
      checks: [
        {
          name: "risk_engine_wiring",
          status: "fail",
          message:
            "Project risk engine dependencies are not wired to the MCP bridge yet."
        }
      ],
      required_approvals: ["risk"]
    });
  }
}
