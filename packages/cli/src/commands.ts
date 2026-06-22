import { createInterface } from "node:readline/promises";
import { stdout as processStdout } from "node:process";
import type { Readable, Writable } from "node:stream";
import { runCodexLogin } from "./codex-cli.js";
import {
  codexAuthStatus,
  ensureOpenStratCliHome,
  resolveOpenStratCliHome
} from "./home.js";
import { runOpenStratMcpServer } from "./mcp.js";
import { createCodexWorkbenchRuntime, type CodexWorkbenchRuntime } from "./runtime.js";
import {
  appendTranscript,
  createWorkbenchSession,
  listWorkbenchSessions,
  projectCodexEventsToArtifacts,
  saveWorkbenchSession
} from "./session-store.js";
import {
  handleSlashCommand,
  isSlashCommand,
  OPENSTRAT_SLASH_COMMANDS
} from "./slash-commands.js";

export interface RunOpenStratCliOptions {
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  stdin?: Readable;
  output?: Writable;
  inputLines?: string[] | undefined;
  cliEntrypoint?: string | undefined;
  runtime?: CodexWorkbenchRuntime;
}

export interface CliResult {
  exitCode: number;
}

export async function runOpenStratCli(
  options: RunOpenStratCliOptions
): Promise<CliResult> {
  const stdout = options.stdout ?? ((line: string) => console.log(line));
  const stderr = options.stderr ?? ((line: string) => console.error(line));
  const home = resolveOpenStratCliHome({ cwd: options.cwd, env: options.env });
  ensureOpenStratCliHome(home);
  const [command, ...rest] = options.argv;

  try {
    if (command === "mcp") {
      await runOpenStratMcpServer(options.env, options.cwd);
      return { exitCode: 0 };
    }
    if (command === "doctor") {
      emitDoctor(stdout, home, options.env);
      return { exitCode: 0 };
    }
    if (command === "auth" && rest[0] === "status") {
      emitAuthStatus(stdout, home, options.env);
      return { exitCode: 0 };
    }
    if (command === "auth" && (rest[0] === "codex" || rest[0] === "login")) {
      const exitCode = await runCodexLogin({
        home,
        env: options.env,
        argv: rest.slice(1)
      });
      return { exitCode };
    }
    if (command === "sessions") {
      emitSessions(stdout, home);
      return { exitCode: 0 };
    }
    if (command === "chat") {
      const prompt = stringFlag(rest, "--prompt");
      if (!prompt) {
        throw new Error("Usage: openstrat chat --prompt <prompt>");
      }
      return await runHeadlessTurn({
        ...options,
        prompt,
        stdout,
        stderr
      });
    }
    if (command === undefined) {
      return await runWorkbenchTui({
        ...options,
        stdout,
        stderr
      });
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return { exitCode: 1 };
  }
}

async function runHeadlessTurn(
  options: RunOpenStratCliOptions & {
    prompt: string;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
  }
): Promise<CliResult> {
  const home = resolveOpenStratCliHome({ cwd: options.cwd, env: options.env });
  const runtime = options.runtime ?? createCodexWorkbenchRuntime(options.env);
  let session = createWorkbenchSession(home, options.cwd, "OpenStrat headless chat");
  appendTranscript(home, session, "user_message", { text: options.prompt });
  const result = await runtime.runTurn({
    prompt: options.prompt,
    cwd: options.cwd,
    env: options.env,
    home,
    cliEntrypoint: options.cliEntrypoint,
    onEvent: (event) => {
      appendTranscript(home, session, "codex_event", { event });
      projectCodexEventsToArtifacts(home, session, event);
    }
  });
  session = saveWorkbenchSession(home, {
    ...session,
    ...(result.codexThreadId ? { codex_thread_id: result.codexThreadId } : {})
  });
  appendTranscript(home, session, "codex_final_response", {
    text: result.finalResponse
  });
  options.stdout(`session: ${session.id}`);
  if (session.codex_thread_id) {
    options.stdout(`codex_thread: ${session.codex_thread_id}`);
  }
  options.stdout(result.finalResponse);
  return { exitCode: 0 };
}

async function runWorkbenchTui(
  options: RunOpenStratCliOptions & {
    stdout: (line: string) => void;
    stderr: (line: string) => void;
  }
): Promise<CliResult> {
  const home = resolveOpenStratCliHome({ cwd: options.cwd, env: options.env });
  const runtime = options.runtime ?? createCodexWorkbenchRuntime(options.env);
  let session = createWorkbenchSession(home, options.cwd);
  const nextSession = () => createWorkbenchSession(home, options.cwd);
  const lines = options.inputLines ?? [];
  const reader =
    lines.length === 0 && options.stdin
      ? createInterface({
          input: options.stdin,
          output: options.output ?? processStdout,
          terminal: false
        })
      : undefined;

  options.stdout("OpenStrat Workbench");
  options.stdout(`runtime: ${runtime.kind}`);
  options.stdout(`session: ${session.id}`);
  options.stdout(`commands: ${OPENSTRAT_SLASH_COMMANDS.join(", ")}`);

  let index = 0;
  while (true) {
    const line =
      index < lines.length
        ? lines[index++]
        : reader
          ? await reader.question("openstrat> ")
          : undefined;
    if (line === undefined) {
      break;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed === "/exit" || trimmed === "/quit") {
      options.stdout("bye");
      break;
    }
    if (isSlashCommand(trimmed)) {
      const result = handleSlashCommand(
        trimmed,
        {
          cwd: options.cwd,
          env: options.env,
          home,
          session
        },
        nextSession
      );
      appendTranscript(home, session, "slash_command", {
        command: result.command,
        status: result.status,
        data: result.data
      });
      if (result.session) {
        session = result.session;
      }
      options.stdout(formatCommandResult(result.summary, result.next_suggested_action));
      continue;
    }

    appendTranscript(home, session, "user_message", { text: trimmed });
    options.stdout("codex: working");
    const result = await runtime.runTurn({
      prompt: trimmed,
      cwd: options.cwd,
      env: options.env,
      codexThreadId: session.codex_thread_id,
      home,
      cliEntrypoint: options.cliEntrypoint,
      onEvent: (event) => {
        appendTranscript(home, session, "codex_event", { event });
        projectCodexEventsToArtifacts(home, session, event);
        if (event.type === "item.completed") {
          options.stdout(`event: ${event.item.type}`);
        }
      }
    });
    session = saveWorkbenchSession(home, {
      ...session,
      ...(result.codexThreadId ? { codex_thread_id: result.codexThreadId } : {})
    });
    appendTranscript(home, session, "codex_final_response", {
      text: result.finalResponse
    });
    options.stdout(result.finalResponse);
  }

  reader?.close();
  return { exitCode: 0 };
}

function emitDoctor(
  stdout: (line: string) => void,
  home: ReturnType<typeof resolveOpenStratCliHome>,
  env: Record<string, string | undefined>
): void {
  const auth = codexAuthStatus(home, env);
  stdout("openstrat: ok");
  stdout("runtime: codex_sdk");
  stdout(`codex auth: ${auth.configured ? auth.method : "missing"}`);
  stdout(`project home: ${home.projectRoot}`);
  stdout(`user home: ${home.userRoot}`);
}

function emitAuthStatus(
  stdout: (line: string) => void,
  home: ReturnType<typeof resolveOpenStratCliHome>,
  env: Record<string, string | undefined>
): void {
  const auth = codexAuthStatus(home, env);
  stdout(`codex auth: ${auth.configured ? auth.method : "missing"}`);
}

function emitSessions(
  stdout: (line: string) => void,
  home: ReturnType<typeof resolveOpenStratCliHome>
): void {
  for (const session of listWorkbenchSessions(home)) {
    stdout(
      `${session.id}\t${session.updated_at}\t${session.codex_thread_id ?? "no-codex-thread"}`
    );
  }
}

function stringFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return argv[index + 1];
}

function formatCommandResult(summary: string, nextSuggestedAction?: string): string {
  return nextSuggestedAction ? `${summary}\nnext: ${nextSuggestedAction}` : summary;
}
