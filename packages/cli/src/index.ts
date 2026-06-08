import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runOpenStratCli } from "./commands.js";

export { runOpenStratCli } from "./commands.js";
export * from "./home.js";

if (isDirectCliInvocation()) {
  const result = await runOpenStratCli({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    stderr: (line) => console.error(line),
    stdout: (line) => console.log(line)
  });
  process.exitCode = result.exitCode;
}

function isDirectCliInvocation(): boolean {
  if (!process.argv[1]) {
    return false;
  }
  return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
}
