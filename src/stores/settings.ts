import { computed, ref, onScopeDispose } from "vue";
import { defineStore } from "pinia";
import { defaultSettings } from "../types/workspace";
import type { Settings } from "../types/workspace";
import { backend } from "../services/backend";
export const useSettingsStore = defineStore("settings", () => {
  const value = ref(defaultSettings());
  const systemDark = ref(
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const appearance = computed(() =>
    value.value.appearance === "system"
      ? systemDark.value
        ? "dark"
        : "light"
      : value.value.appearance,
  );
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const changed = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches;
  };
  media?.addEventListener("change", changed);
  onScopeDispose(() => media?.removeEventListener("change", changed));
  const configDir = ref("");
  const clone = <T>(input: T): T => JSON.parse(JSON.stringify(input));
  const snapshot = (settings: Settings) =>
    clone(settings) as unknown as Record<string, unknown>;
  // Baseline of what the database already holds, so a save from this window
  // never overwrites a key another window changed.
  let synced = snapshot(value.value);
  function adopt(settings: Settings) {
    value.value = settings;
    synced = snapshot(settings);
  }
  // Owned by the database, never by a window snapshot.
  const serverOwned = ["recentEntries", "recentFiles", "lastFolder"];
  async function persist() {
    const patch: Record<string, unknown> = {};
    for (const [key, current] of Object.entries(value.value)) {
      if (serverOwned.includes(key)) continue;
      if (JSON.stringify(current) !== JSON.stringify(synced[key]))
        patch[key] = clone(current);
    }
    if (!Object.keys(patch).length) return;
    const saved = await backend.settings(patch);
    if (!saved) return;
    // Only the keys we sent are known to be stored. An edit made while the save
    // was in flight stays divergent and rides along with the next pass.
    for (const [key, sent] of Object.entries(patch)) synced[key] = sent;
    const merged = value.value as unknown as Record<string, unknown>;
    const stored = saved as unknown as Record<string, unknown>;
    for (const key of serverOwned) {
      merged[key] = stored[key];
      synced[key] = clone(stored[key]);
    }
  }
  return { value, systemDark, appearance, configDir, persist, adopt };
});
