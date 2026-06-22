import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Codex, type CodexOptions, type ThreadEvent } from "@openai/codex-sdk";
import type { OpenStratCliHome } from "./home.js";

type CodexConfigObject = NonNullable<CodexOptions["config"]>;

export interface CodexTurnInput {
  prompt: string;
  cwd: string;
  env: Record<string, string | undefined>;
  codexThreadId?: string | undefined;
  home: OpenStratCliHome;
  cliEntrypoint?: string | undefined;
  onEvent?: (event: ThreadEvent) => void;
}

export interface CodexTurnResult {
  codexThreadId?: string | undefined;
  finalResponse: string;
  events: ThreadEvent[];
}

export interface CodexWorkbenchRuntime {
  kind: "codex_sdk" | "fake_codex";
  runTurn(input: CodexTurnInput): Promise<CodexTurnResult>;
}

export function createCodexWorkbenchRuntime(
  env: Record<string, string | undefined>
): CodexWorkbenchRuntime {
  if (env.OPENSTRAT_CODEX_RUNTIME === "fake") {
    return new FakeCodexWorkbenchRuntime();
  }
  return new SdkCodexWorkbenchRuntime();
}

class SdkCodexWorkbenchRuntime implements CodexWorkbenchRuntime {
  readonly kind = "codex_sdk" as const;

  async runTurn(input: CodexTurnInput): Promise<CodexTurnResult> {
    const codex = new Codex({
      env: codexEnvironment(input.env, input.home),
      config: {
        mcp_servers: openStratMcpConfig(input)
      }
    });
    const threadOptions = {
      workingDirectory: input.cwd,
      skipGitRepoCheck: true,
      sandboxMode: "workspace-write" as const,
      approvalPolicy: "on-request" as const
    };
    const thread = input.codexThreadId
      ? codex.resumeThread(input.codexThreadId, threadOptions)
      : codex.startThread(threadOptions);
    const { events } = await thread.runStreamed(openStratPrompt(input.prompt));
    const captured: ThreadEvent[] = [];
    let finalResponse = "";

    for await (const event of events) {
      captured.push(event);
      input.onEvent?.(event);
      if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalResponse = event.item.text;
      }
    }

    return {
      codexThreadId: thread.id ?? input.codexThreadId,
      finalResponse,
      events: captured
    };
  }
}

class FakeCodexWorkbenchRuntime implements CodexWorkbenchRuntime {
  readonly kind = "fake_codex" as const;

  async runTurn(input: CodexTurnInput): Promise<CodexTurnResult> {
    const threadId = input.codexThreadId ?? `fake_thread_${Date.now()}`;
    const events: ThreadEvent[] = [
      { type: "thread.started", thread_id: threadId },
      { type: "turn.started" }
    ];

    if (input.prompt.toLowerCase().includes("strategy")) {
      const strategyPath = join(input.cwd, "src", "strategy.ts");
      mkdirSync(join(strategyPath, ".."), { recursive: true });
      writeFileSync(
        strategyPath,
        `import { defineStrategy } from "@openstrat/strategy-sdk";\n\nexport const strategy = defineStrategy({\n  strategy_id: "fake_codex_strategy",\n  strategy_version: "0.1.0",\n  name: "Fake Codex Strategy",\n  description: "Deterministic test strategy written by the fake Codex runtime.",\n  runtime: "typescript",\n  entrypoint: "src/strategy.ts",\n  autonomy_mode: "strategy_workbench",\n  allowed_symbols: ["BTC-PERP"],\n  parameters: {},\n  required_data: [],\n  output: "trade_intent",\n  created_at: "2026-06-22T00:00:00.000Z",\n  source_refs: []\n}, () => []);\n`,
        "utf8"
      );
      events.push({
        type: "item.completed",
        item: {
          id: "fake_file_change_001",
          type: "file_change",
          status: "completed",
          changes: [{ path: "src/strategy.ts", kind: "add" }]
        }
      });
    }

    const finalResponse =
      "Fake Codex completed the turn. In live mode, Codex SDK owns file/shell tools.";
    events.push({
      type: "item.completed",
      item: {
        id: "fake_agent_message_001",
        type: "agent_message",
        text: finalResponse
      }
    });
    events.push({
      type: "turn.completed",
      usage: {
        input_tokens: 1,
        cached_input_tokens: 0,
        output_tokens: 1,
        reasoning_output_tokens: 0
      }
    });

    for (const event of events) {
      input.onEvent?.(event);
    }

    return {
      codexThreadId: threadId,
      finalResponse,
      events
    };
  }
}

function codexEnvironment(
  env: Record<string, string | undefined>,
  home: OpenStratCliHome
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  result.CODEX_HOME = home.codexHome;
  result.OPENSTRAT_HOME = home.projectRoot;
  result.OPENSTRAT_USER_HOME = home.userRoot;
  return result;
}

function openStratMcpConfig(input: CodexTurnInput): CodexConfigObject {
  const entrypoint = input.cliEntrypoint;
  if (!entrypoint) {
    return {};
  }
  return {
    openstrat: {
      command: process.execPath,
      args: [entrypoint, "mcp"],
      env: {
        OPENSTRAT_HOME: input.home.projectRoot,
        OPENSTRAT_USER_HOME: input.home.userRoot,
        CODEX_HOME: input.home.codexHome
      },
      enabled: true,
      required: false,
      default_tools_approval_mode: "auto"
    }
  };
}

function openStratPrompt(prompt: string): string {
  return [
    "You are running inside OpenStrat, a trading strategy engineering workbench.",
    "Use Codex native file and shell tools for code inspection, edits, tests, and validation.",
    "Use OpenStrat MCP tools for trading-domain context when available.",
    "Generated strategy code must stay exchange-agnostic and use OpenStrat strategy contracts.",
    "",
    prompt
  ].join("\n");
}
