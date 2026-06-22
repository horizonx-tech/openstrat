import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TOOL_GATEWAY_TOOLS } from "@openstrat/workers";
import {
  appendArtifactIndexEntry,
  listWorkbenchSessions,
  readArtifactIndex,
  readWorkbenchSession,
  writeSessionSummary,
  type WorkbenchSessionRecord
} from "./session-store.js";
import { codexAuthStatus, type OpenStratCliHome } from "./home.js";

export interface SlashCommandContext {
  cwd: string;
  env: Record<string, string | undefined>;
  home: OpenStratCliHome;
  session: WorkbenchSessionRecord;
}

export interface SlashCommandResult {
  command: string;
  status: "ok" | "unavailable" | "error";
  summary: string;
  data: Record<string, unknown>;
  next_suggested_action?: string;
  session?: WorkbenchSessionRecord;
}

export const OPENSTRAT_SLASH_COMMANDS = [
  "/status",
  "/markets",
  "/datasets",
  "/strategy",
  "/backtest",
  "/risk",
  "/artifacts",
  "/sessions",
  "/new",
  "/resume",
  "/compact",
  "/deploy"
] as const;

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

export function handleSlashCommand(
  input: string,
  context: SlashCommandContext,
  createSession: () => WorkbenchSessionRecord
): SlashCommandResult {
  const [command = "", ...args] = input.trim().split(/\s+/);
  let result: SlashCommandResult;
  switch (command) {
    case "/status":
      result = statusCommand(command, context);
      break;
    case "/markets":
      result = marketsCommand(command);
      break;
    case "/datasets":
      result = datasetsCommand(command, context);
      break;
    case "/strategy":
      result = strategyCommand(command, context);
      break;
    case "/backtest":
      result = scaffoldCommand(
        command,
        "Backtest execution is not yet wired to the TUI command surface.",
        "Ask Codex to create or inspect a backtest request, then wire the deterministic runner in the next implementation slice."
      );
      break;
    case "/risk":
      result = scaffoldCommand(
        command,
        "Risk review inspection is not yet wired to the TUI command surface.",
        "Ask Codex to inspect risk policy contracts or run the next workbench-risk slice."
      );
      break;
    case "/deploy":
      result = scaffoldCommand(
        command,
        "Deployment is intentionally unavailable in this wallet/cloud-free TUI goal.",
        "Finish local strategy validation and backtest evidence first."
      );
      break;
    case "/artifacts":
      result = artifactsCommand(command, context);
      break;
    case "/sessions":
      result = sessionsCommand(command, context);
      break;
    case "/new":
      result = newSessionCommand(command, createSession);
      break;
    case "/resume":
      result = resumeCommand(command, context, args[0]);
      break;
    case "/compact":
      result = compactCommand(command, context);
      break;
    default:
      result = {
        command,
        status: "error",
        summary: `Unknown OpenStrat command: ${command}`,
        data: {
          available_commands: OPENSTRAT_SLASH_COMMANDS
        }
      };
  }
  appendArtifactIndexEntry(context.home, {
    session_id: context.session.id,
    kind: "slash_command_result",
    summary: result.summary,
    metadata: {
      command: result.command,
      status: result.status,
      data: result.data
    }
  });
  return result;
}

function statusCommand(
  command: string,
  context: SlashCommandContext
): SlashCommandResult {
  const auth = codexAuthStatus(context.home, context.env);
  return {
    command,
    status: "ok",
    summary: `OpenStrat session ${context.session.id} using Codex SDK runtime.`,
    data: {
      runtime: "codex_sdk",
      codex_auth: {
        configured: auth.configured,
        method: auth.method
      },
      sandbox_mode: "workspace-write",
      approval_policy: "on-request",
      project_home: context.home.projectRoot,
      openstrat_user_home: context.home.userRoot,
      codex_home_configured: Boolean(context.env.CODEX_HOME),
      codex_thread_id: context.session.codex_thread_id,
      gateway_tools: AGENT_TOOL_GATEWAY_TOOLS
    },
    next_suggested_action: auth.configured
      ? "Ask Codex to inspect market data and strategy files."
      : "Run Codex login with this CODEX_HOME or set an API key before live Codex turns."
  };
}

function marketsCommand(command: string): SlashCommandResult {
  return {
    command,
    status: "ok",
    summary:
      "OpenStrat market gateway is present; project market index wiring is pending.",
    data: {
      supported_venues: ["hyperliquid"],
      tools: ["market_data.read_snapshot"],
      project_index_status: "not_yet_backed"
    },
    next_suggested_action:
      "Wire project dataset indexes to /markets, or ask Codex to inspect Hyperliquid fixture data."
  };
}

function datasetsCommand(
  command: string,
  context: SlashCommandContext
): SlashCommandResult {
  const entries = readArtifactIndex(context.home).entries.filter(
    (entry) =>
      entry.kind.includes("codex") && JSON.stringify(entry.metadata).includes("dataset")
  );
  return {
    command,
    status: entries.length > 0 ? "ok" : "unavailable",
    summary:
      entries.length > 0
        ? `Found ${entries.length} dataset-related artifact entries.`
        : "No project dataset index is available yet.",
    data: {
      entries: entries.slice(-10)
    },
    next_suggested_action:
      "Use market-data ingestion before asking Codex to backtest against a dataset ref."
  };
}

function strategyCommand(
  command: string,
  context: SlashCommandContext
): SlashCommandResult {
  const candidates = ["src/strategy.ts", "strategies"].flatMap((candidate) => {
    const path = join(context.cwd, candidate);
    if (!existsSync(path)) {
      return [];
    }
    if (candidate.endsWith(".ts")) {
      return [candidate];
    }
    return readdirSync(path)
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => `${candidate}/${entry}`);
  });
  return {
    command,
    status: "ok",
    summary:
      candidates.length > 0
        ? `Found ${candidates.length} strategy source candidate(s).`
        : "No strategy source file found yet.",
    data: {
      strategy_files: candidates
    },
    next_suggested_action:
      candidates.length > 0
        ? "Ask Codex to validate or improve the strategy."
        : "Ask Codex to write a strategy using @openstrat/strategy-sdk."
  };
}

function artifactsCommand(
  command: string,
  context: SlashCommandContext
): SlashCommandResult {
  const entries = readArtifactIndex(context.home).entries;
  return {
    command,
    status: "ok",
    summary: `Artifact index contains ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`,
    data: {
      entries: entries.slice(-10)
    }
  };
}

function sessionsCommand(
  command: string,
  context: SlashCommandContext
): SlashCommandResult {
  const sessions = listWorkbenchSessions(context.home);
  return {
    command,
    status: "ok",
    summary: `Found ${sessions.length} OpenStrat workbench session(s).`,
    data: {
      sessions: sessions.map((session) => ({
        id: session.id,
        updated_at: session.updated_at,
        cwd: session.cwd,
        codex_thread_id: session.codex_thread_id,
        summary_ref: session.summary_ref
      }))
    }
  };
}

function newSessionCommand(
  command: string,
  createSession: () => WorkbenchSessionRecord
): SlashCommandResult {
  const session = createSession();
  return {
    command,
    status: "ok",
    summary: `Started new OpenStrat session ${session.id}.`,
    data: {
      session_id: session.id
    },
    session
  };
}

function resumeCommand(
  command: string,
  context: SlashCommandContext,
  sessionId?: string
): SlashCommandResult {
  if (!sessionId) {
    return sessionsCommand(command, context);
  }
  const session = readWorkbenchSession(context.home, sessionId);
  if (!session) {
    return {
      command,
      status: "error",
      summary: `Session not found: ${sessionId}`,
      data: { session_id: sessionId }
    };
  }
  return {
    command,
    status: "ok",
    summary: `Resumed OpenStrat session ${session.id}.`,
    data: {
      session_id: session.id,
      codex_thread_id: session.codex_thread_id
    },
    session
  };
}

function compactCommand(
  command: string,
  context: SlashCommandContext
): SlashCommandResult {
  const session = writeSessionSummary(context.home, context.session);
  return {
    command,
    status: "ok",
    summary: `Wrote OpenStrat session summary for ${session.id}.`,
    data: {
      session_id: session.id,
      summary_ref: session.summary_ref
    },
    session
  };
}

function scaffoldCommand(
  command: string,
  summary: string,
  nextSuggestedAction: string
): SlashCommandResult {
  return {
    command,
    status: "unavailable",
    summary,
    data: {
      backed: false
    },
    next_suggested_action: nextSuggestedAction
  };
}
