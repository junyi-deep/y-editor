import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

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
    // Use child processes instead of worker threads to avoid the
    // "Timeout calling onTaskUpdate" RPC errors on Windows CI.
    pool: "forks",
    // Heavy jsdom + CodeMirror tests need a generous timeout,
    // especially on Windows CI runners.
    testTimeout: 30_000,
  },
});
