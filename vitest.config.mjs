import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    globalSetup: ["tests/setup/globalSetup.js"],
    setupFiles: ["tests/setup/env.js"],
    testTimeout: 20000,
    hookTimeout: 120000,
  },
});
