import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { OpenStratCliHome } from "./home.js";

const require = createRequire(import.meta.url);

export function resolveBundledCodexCli(): string {
  const packageJson = require.resolve("@openai/codex/package.json");
  return join(dirname(packageJson), "bin", "codex.js");
}

export async function runCodexLogin(options: {
  home: OpenStratCliHome;
  env: Record<string, string | undefined>;
  argv: string[];
}): Promise<number> {
  const codexCli = resolveBundledCodexCli();
  const env = codexLoginEnv(options.home, options.env);
  const child = spawn(process.execPath, [codexCli, "login", ...options.argv], {
    env,
    stdio: "inherit"
  });
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function codexLoginEnv(
  home: OpenStratCliHome,
  env: Record<string, string | undefined>
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  next.CODEX_HOME = home.codexHome;
  next.OPENSTRAT_HOME = home.projectRoot;
  next.OPENSTRAT_USER_HOME = home.userRoot;
  return next;
}
