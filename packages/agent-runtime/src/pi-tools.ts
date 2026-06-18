import type {
  AgentToolResult,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";
import {
  agentToolGatewayToolDefinition,
  type AgentToolGateway,
  type AgentToolGatewayToolName
} from "@openstrat/workers";
import { Type } from "typebox";

export interface CreatePiAgentGatewayToolDefinitionsInput {
  gateway: AgentToolGateway;
  session_id: string;
  toolNames: readonly AgentToolGatewayToolName[];
  turnIdForToolCall?: (toolCallId: string) => string;
}

export function createPiAgentGatewayToolDefinitions(
  input: CreatePiAgentGatewayToolDefinitionsInput
): ToolDefinition[] {
  return input.toolNames.map((toolName) =>
    createPiAgentGatewayToolDefinition(input, toolName)
  );
}

function createPiAgentGatewayToolDefinition(
  input: CreatePiAgentGatewayToolDefinitionsInput,
  toolName: AgentToolGatewayToolName
): ToolDefinition {
  const registryDefinition = agentToolGatewayToolDefinition(toolName);
  return {
    name: toolName,
    label: `OpenStrat ${toolName}`,
    description: descriptionFor(toolName),
    promptSnippet: `OpenStrat harness tool: ${toolName}. Use this instead of native file, shell, or exchange mutation for trading workbench state.`,
    promptGuidelines: [
      "Use OpenStrat tools for market data, strategy proposals, backtest requests, risk checks, memory proposals, and deployment-gate inspection.",
      "Treat returned refs as durable evidence. Do not claim a strategy is ready without the relevant OpenStrat artifact refs.",
      "Do not use native coding or shell tools to mutate canonical trading harness state."
    ],
    parameters: parametersFor(toolName),
    async execute(
      toolCallId,
      params
    ): Promise<AgentToolResult<Record<string, unknown>>> {
      const result = await input.gateway.invoke({
        call_id: toolCallId,
        session_id: input.session_id,
        turn_id:
          input.turnIdForToolCall?.(toolCallId) ??
          `${input.session_id}:${toolCallId}`,
        tool_name: toolName,
        arguments: params as Record<string, unknown>
      });
      const resultRef = resultRefFrom(result);
      return {
        content: [
          {
            type: "text",
            text: [
              `${toolName} completed.`,
              resultRef ? `result_ref: ${resultRef}` : undefined
            ]
              .filter(Boolean)
              .join(" ")
          }
        ],
        details: {
          tool_name: toolName,
          side_effect: registryDefinition.side_effect,
          ...(resultRef ? { result_ref: resultRef } : {}),
          result
        }
      };
    }
  };
}

function parametersFor(toolName: AgentToolGatewayToolName) {
  switch (toolName) {
    case "market_data.read_snapshot":
      return Type.Object({
        canonical_symbol: Type.String({
          description: "OpenStrat canonical symbol, for example ETH-PERP."
        }),
        source: Type.Optional(Type.String()),
        venue: Type.Optional(Type.String())
      });
    case "backtest.request":
      return Type.Object({
        request: Type.Any({ description: "BacktestRequest payload." })
      });
    case "risk.validate_intent":
      return Type.Object({
        intent: Type.Any({ description: "TradeIntent payload." }),
        policy: Type.Any({ description: "RiskPolicy payload." }),
        context: Type.Any({ description: "RiskContext payload." })
      });
    case "strategy_patch.capture":
    case "memory_proposal.capture":
      return Type.Object({
        proposal: Type.Any({ description: "Proposal payload." })
      });
    case "deployment_gate.inspect":
      return Type.Object({
        gate: Type.Any({ description: "DeploymentGate payload." })
      });
  }
}

function descriptionFor(toolName: AgentToolGatewayToolName): string {
  switch (toolName) {
    case "market_data.read_snapshot":
      return "Read a market snapshot and latest dataset context through OpenStrat.";
    case "backtest.request":
      return "Capture a proposed backtest request as an OpenStrat artifact.";
    case "risk.validate_intent":
      return "Validate a trade intent against an OpenStrat risk policy.";
    case "strategy_patch.capture":
      return "Capture a proposed strategy patch artifact.";
    case "memory_proposal.capture":
      return "Capture a proposed trading memory artifact for review.";
    case "deployment_gate.inspect":
      return "Inspect deployment-gate readiness without launching deployment.";
  }
}

function resultRefFrom(result: unknown): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }
  const artifactRef = result.artifact_ref;
  if (isRecord(artifactRef) && typeof artifactRef.uri === "string") {
    return artifactRef.uri;
  }
  for (const key of [
    "dataset_ref",
    "latest_price_ref",
    "id",
    "gate_id"
  ] as const) {
    const value = result[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
