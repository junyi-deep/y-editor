import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Vitest does not read vite.config.ts, so the `@` alias must be repeated here.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [vue()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], restoreMocks: true },
});
