import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config for `npm run amazon:sandbox-check` only: runs the live Amazon
// static-sandbox check with the real modules. No database, no test setup.
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["scripts/amazon-sandbox-check.mjs"],
    testTimeout: 60000,
  },
});
