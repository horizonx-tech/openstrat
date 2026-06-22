import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: [
    "@modelcontextprotocol/sdk/*",
    "@openai/codex",
    "@openai/codex-sdk",
    "zod"
  ],
  format: "esm",
  outfile: "dist/index.js",
  platform: "node",
  sourcemap: true,
  target: "node22"
});

const binPath = join("dist", "openstrat");
writeFileSync(
  binPath,
  '#!/usr/bin/env node\nimport { runProcessCli } from "./index.js";\nawait runProcessCli();\n',
  "utf8"
);
chmodSync(binPath, 0o755);
