import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url))
    },
    tsconfigPaths: true
  },
  test: {
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tests/**/*.test.ts"],
    restoreMocks: true
  }
});
