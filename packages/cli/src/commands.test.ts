import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OPENSTRAT_CODEX_BASELINE_CONTRACT } from "@openstrat/domain";
import { AGENT_TOOL_GATEWAY_TOOLS } from "@openstrat/workers";
import { runOpenStratCli } from "./commands.js";
import { invokeOpenStratMcpTool } from "./mcp.js";
import {
  artifactIndexPath,
  listWorkbenchSessions,
  readArtifactIndex
} from "./session-store.js";
import { resolveOpenStratCliHome } from "./home.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("OpenStrat CLI Codex workbench", () => {
  it("reports auth and home boundaries without reading token contents", async () => {
    const fixture = createFixture();
    mkdirSync(fixture.codexHome, { recursive: true });
    writeFileSync(
      join(fixture.codexHome, "auth.json"),
      JSON.stringify({ token: "secret-token-that-must-not-print" }),
      "utf8"
    );
    const output: string[] = [];

    const result = await runOpenStratCli({
      argv: ["doctor"],
      cwd: fixture.project,
      env: fixture.env,
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(output.join("\n")).toContain("codex auth: chatgpt_cache");
    expect(output.join("\n")).not.toContain("secret-token-that-must-not-print");
    expect(output.join("\n")).toContain(`project home: ${fixture.openstratHome}`);
    expect(output.join("\n")).toContain(`user home: ${fixture.userHome}`);
  });

  it("launches bare TUI, handles slash commands, and projects fake Codex turns", async () => {
    const fixture = createFixture();
    const output: string[] = [];

    const result = await runOpenStratCli({
      argv: [],
      cwd: fixture.project,
      env: {
        ...fixture.env,
        OPENSTRAT_CODEX_RUNTIME: "fake"
      },
      inputLines: [
        "/status",
        "/markets",
        "/new",
        "write a simple OpenStrat strategy",
        "/strategy",
        "/compact",
        "/exit"
      ],
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(output[0]).toBe("OpenStrat Workbench");
    expect(output.join("\n")).toContain("runtime: fake_codex");
    expect(output.join("\n")).toContain("Started new OpenStrat session");
    expect(output.join("\n")).toContain("event: file_change");
    expect(output.join("\n")).toContain("Found 1 strategy source candidate");
    expect(readFileSync(join(fixture.project, "src", "strategy.ts"), "utf8")).toContain(
      "defineStrategy"
    );

    const home = resolveOpenStratCliHome({
      cwd: fixture.project,
      env: {
        ...fixture.env,
        OPENSTRAT_CODEX_RUNTIME: "fake"
      }
    });
    const sessions = listWorkbenchSessions(home);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(readArtifactIndex(home).entries.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        "slash_command_result",
        "codex_file_change",
        "codex_agent_message",
        "session_summary"
      ])
    );
  });

  it("runs a headless prompt through the same session and artifact projection", async () => {
    const fixture = createFixture();
    const output: string[] = [];

    const result = await runOpenStratCli({
      argv: ["chat", "--prompt", "write a strategy"],
      cwd: fixture.project,
      env: {
        ...fixture.env,
        OPENSTRAT_CODEX_RUNTIME: "fake"
      },
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(output.join("\n")).toContain("Fake Codex completed the turn");
    expect(readFileSync(join(fixture.project, "src", "strategy.ts"), "utf8")).toContain(
      "fake_codex_strategy"
    );
    const home = resolveOpenStratCliHome({ cwd: fixture.project, env: fixture.env });
    expect(readFileSync(artifactIndexPath(home), "utf8")).toContain(
      "codex_file_change"
    );
  });

  it("lists and resumes OpenStrat sessions without owning Codex internals", async () => {
    const fixture = createFixture();
    await runOpenStratCli({
      argv: ["chat", "--prompt", "write a strategy"],
      cwd: fixture.project,
      env: {
        ...fixture.env,
        OPENSTRAT_CODEX_RUNTIME: "fake"
      },
      stdout: () => undefined,
      stderr: () => undefined
    });
    const home = resolveOpenStratCliHome({ cwd: fixture.project, env: fixture.env });
    const [session] = listWorkbenchSessions(home);
    expect(session?.codex_thread_id).toMatch(/^fake_thread_/);

    const output: string[] = [];
    const result = await runOpenStratCli({
      argv: [],
      cwd: fixture.project,
      env: {
        ...fixture.env,
        OPENSTRAT_CODEX_RUNTIME: "fake"
      },
      inputLines: ["/sessions", `/resume ${session?.id}`, "/exit"],
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(output.join("\n")).toContain(`Resumed OpenStrat session ${session?.id}`);
    expect(output.join("\n")).toContain("Found 2 OpenStrat workbench session");
  });

  it("fails clearly for unknown slash commands", async () => {
    const fixture = createFixture();
    const output: string[] = [];

    const result = await runOpenStratCli({
      argv: [],
      cwd: fixture.project,
      env: {
        ...fixture.env,
        OPENSTRAT_CODEX_RUNTIME: "fake"
      },
      inputLines: ["/definitely-not-real", "/exit"],
      stdout: (line) => output.push(line),
      stderr: (line) => output.push(line)
    });

    expect(result.exitCode).toBe(0);
    expect(output.join("\n")).toContain(
      "Unknown OpenStrat command: /definitely-not-real"
    );
  });

  it("keeps the Codex baseline tool contract aligned with gateway and MCP names", () => {
    expect(
      OPENSTRAT_CODEX_BASELINE_CONTRACT.openstrat_tools.map((tool) => tool.name)
    ).toEqual([...AGENT_TOOL_GATEWAY_TOOLS]);
    expect(
      OPENSTRAT_CODEX_BASELINE_CONTRACT.openstrat_tools.map((tool) =>
        tool.name.replaceAll(".", "_")
      )
    ).toEqual([
      "market_data_read_snapshot",
      "backtest_request",
      "risk_validate_intent",
      "strategy_patch_capture",
      "memory_proposal_capture",
      "deployment_gate_inspect"
    ]);
  });

  it("routes Codex-facing MCP tools through the OpenStrat gateway", async () => {
    const fixture = createFixture();
    const output = await invokeOpenStratMcpTool(
      "strategy_patch.capture",
      {
        call_id: "mcp_call_strategy_patch",
        session_id: "session_mcp",
        turn_id: "turn_mcp",
        proposal: {
          id: "strategy_patch_001",
          created_at: "2026-06-22T00:00:00.000Z",
          session_id: "session_mcp",
          status: "proposed",
          strategy_id: "btc_breakout",
          patch_format: "unified_diff",
          patch_ref: "agent-artifacts/strategy_patch_001.diff",
          rationale: "Test capture through MCP bridge.",
          artifact_ref: {
            id: "artifact_strategy_patch_001",
            kind: "proposal",
            uri: "agent-artifacts/strategy_patch_001.json",
            content_hash: "sha256:strategy-patch",
            created_at: "2026-06-22T00:00:00.000Z",
            append_only: true
          }
        }
      },
      fixture.env,
      fixture.project
    );

    expect(output.status).toBe("completed");
    expect(output.canonical_tool_name).toBe("strategy_patch.capture");
    expect(
      existsSync(
        join(
          fixture.openstratHome,
          "objects",
          "agent-artifacts",
          "strategy_patch_001.json"
        )
      )
    ).toBe(true);
  });
});

function createFixture(): {
  root: string;
  project: string;
  openstratHome: string;
  userHome: string;
  codexHome: string;
  env: Record<string, string>;
} {
  const root = mkdtempSync(join(tmpdir(), "openstrat-cli-test-"));
  roots.push(root);
  const project = join(root, "project");
  const openstratHome = join(project, ".openstrat");
  const userHome = join(root, "user-openstrat");
  const codexHome = join(root, "codex-home");
  mkdirSync(project, { recursive: true });
  return {
    root,
    project,
    openstratHome,
    userHome,
    codexHome,
    env: {
      HOME: root,
      OPENSTRAT_HOME: openstratHome,
      OPENSTRAT_USER_HOME: userHome,
      CODEX_HOME: codexHome
    }
  };
}
