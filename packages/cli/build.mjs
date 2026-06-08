import { build } from "esbuild";

await build({
  banner: { js: "#!/usr/bin/env node" },
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: ["@earendil-works/pi-coding-agent"],
  format: "esm",
  logLevel: "info",
  outfile: "dist/index.js",
  platform: "node",
  target: "node22.19",
  tsconfig: "tsconfig.json"
});
