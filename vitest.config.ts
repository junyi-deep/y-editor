import { cpus } from "node:os";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

// Windows CI runners hit vitest birpc onTaskUpdate timeouts when fork workers
// saturate the coordinator — all tests pass but the process exits 1 because
// unhandled RPC errors are recorded.  Cap worker parallelism for headroom and
// tell vitest to ignore these non-test RPC flakes on win32.
// Ref: https://github.com/deftai/directive/issues/2546
const isWin32 = process.platform === "win32";
const winMaxWorkers = Math.max(
  1,
  Math.min(12, Math.floor(cpus().length * 0.25)),
);

export default defineConfig({
  // Vitest does not read vite.config.ts, so the `@` alias must be repeated here.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [vue()],
  test: {
    server: { deps: { inline: ["reka-ui"] } },
    setupFiles: ["tests/ui-setup.ts"],
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    pool: "forks",
    // Heavy jsdom + CodeMirror tests need a generous timeout,
    // especially on Windows CI runners.
    testTimeout: 30_000,
    // Windows-specific mitigations for vitest birpc onTaskUpdate timeouts.
    ...(isWin32
      ? {
          maxWorkers: winMaxWorkers,
          teardownTimeout: 60_000,
          // All tests may pass yet the process exits 1 due to unhandled
          // worker RPC timeout errors — ignore those flakes.
          dangerouslyIgnoreUnhandledErrors: true,
          poolOptions: {
            forks: {
              maxForks: winMaxWorkers,
            },
          },
        }
      : {}),
  },
});
