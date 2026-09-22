import { vi } from "vitest";

/**
 * jsdom note. Once a shadcn-vue (Reka) portal overlay has been opened, later
 * setTimeout/setImmediate callbacks in that file only run when vitest tears the
 * worker down, so `flushPromises` and `vi.waitFor` never resume and the test is
 * reported as timed out even though its body finished. Tests that touch an
 * overlay therefore settle on microtasks (`trigger` already returns nextTick).
 *
 * Two behaviours cannot be observed here at all, because Reka defers them onto
 * timers: outside-pointer dismissal and the return of focus to the trigger.
 * Both are covered against a real browser by scripts/ui-check.mjs.
 */
export const settle = async (ticks = 8) => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

/**
 * Raising the timeout here rather than in vitest.config.ts keeps the shorter
 * default (and its ability to catch a genuine hang) for every file that never
 * opens an overlay. Module scope runs before the file's tests, so importing
 * `settle` is what opts a file into the longer budget.
 */
vi.setConfig({ testTimeout: 30_000 });
