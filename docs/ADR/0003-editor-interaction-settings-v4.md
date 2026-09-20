# ADR 0003 — Unified palette and editor preferences (schema 4)

Accepted 2026-09-18. Implements the user's sixteen requested interaction changes while retaining Tauri 2, Vue 3, Pinia and Vditor IR.

The command registry owns effective shortcuts. Settings store command-ID overrides; an empty string disables a shortcut. Vditor toolbar accelerators are disabled. Native menu accelerators synchronize with the registry and pause while recording replacements. Presets remain available for individual/all resets. Ctrl/Cmd share the portable Mod modifier; physical letter/digit codes keep Option combinations usable on macOS.

Settings schema 4 adds outlineNumbering (true), themePreset (typora), backgroundImage (empty), shortcuts (empty map), wideEditor (false), and recentEntries (file/folder references, maximum eight). Schema 2/3 migration preserves existing preferences and derives recent entries from recentFiles/lastFolder. Older schema 1 migration still applies. Rust owns recent history and ignores caller-supplied recent entries when saving settings. Background imports use a native chooser and copy bounded raster files to configuration storage; reads accept only managed basenames. Vue gains no arbitrary filesystem access.

The palette has file, content and >command modes. Content searches use bounded native rg, return at most 70 matching lines, cancel on query changes and discard stale responses. Sidebar retains files and outline, with each filter at its bottom. Opening a content result navigates to its source line.

Vditor's initial serialization is tracked separately from the original Markdown. When serialization still equals its baseline, the adapter returns the original bytes; initial callbacks and representation-only changes do not mark the document dirty. Actual edits continue through the document store and autosave. Programmatic content replacement establishes a new baseline.

Mermaid preview state stores its source independently of controls/rendered SVG. It isolates pointer clicks from Vditor's click-to-edit handler, supports pointer-captured panning, and opens source only on double-click. Generation guards prevent stale render completion. Large graphs have an explicit render action with visible failure/retry, and upstream preview replacement is detected. Presentation uses a single clipped viewport and disables background editor scrolling. Export controls are copy SVG/PNG only.

App artwork is a repository-owned folded-paper Y SVG. ChatGPT/OpenAI and Material symbols are attributed in THIRD_PARTY_ICONS.md. Presets are application color palettes inspired by named tools, not imported proprietary theme packages.
