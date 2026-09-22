# Editor integration register

Baseline: Milkdown 7.22.1, ADR-0006. No patched upstream package. Vditor, its pnpm patch and copied vendor assets have been removed.

| Integration | Location | Upgrade checks |
| --- | --- | --- |
| Markdown adapter / original-source baseline | `src/editor/adapter/milkdown.ts` | Clean opening, source toggling, edit/undo/redo, IME |
| CodeMirror source and code node views | same | Plain source serialization, selection replacement, language highlighting, read-only |
| Math / YAML extensions | `milkdown-extensions.ts` | Inline/block formulas, frontmatter and footnotes survive edits |
| Table transactions / rectangular cell selection | `milkdown-tables.ts` | Drag selection, alignment, row/column insertion/deletion/reorder and undo |
| Context menu / table creation | `interactions.ts` | Selection preserved across menus; numeric picker and keyboard actions |
| Mermaid independent renderer | `mermaid.ts` | Large/manual diagrams, stale render generations, drag pan, double-click edit, presentation and SVG/PNG clipboard |
| Attachments / HTML | `milkdown.ts` | Native image authorization, original relative paths, sanitized HTML preview/export |
| Host shortcuts | `milkdown.ts`, command registry | Native menus and frontend remapping; built-in formatting keymaps do not bypass overrides |

`.vditor-reset` / `.vditor-ir` remain compatibility selectors for imported CSS and shared interaction helpers. They do not load an old editor. No `vditor-ir__*` selector survives: the Milkdown DOM never renders those nodes, so the Mermaid renderer takes its source, its edit entry point and its "source is open" state from hooks supplied by the code-block node view, and its tests drive those hooks rather than a fabricated Vditor DOM.

## shadcn-vue component source (ADR-0007)

The CLI copies component source into `src/components/ui/`; those files are ours. Patches applied so far:

| File | Patch | Reason |
| --- | --- | --- |
| `ui/select/SelectContent.vue` | Removed the `animate-in`/`animate-out`/`fade-in-0`/`zoom-in-95`/`slide-in-from-*` classes; `relative z-50` → `relative z-[var(--y-z-modal-top)]` | The animation utilities need `tw-animate-css`, which is an extra dependency for motion this product does not want (AppKit menus do not fade); Tailwind's `z-50` sits below the app's `--y-z-modal: 200`, so a select opened inside a modal would paint behind the shade |
| `ui/select/SelectContent.vue` | `shadow-md` → `shadow-[var(--y-shadow-sm)]` | Without a `--shadow-*` bridge, Tailwind's own shadow scale is untinted and identical in light and dark; the app's shadow tokens are tinted and theme-aware |
| `ui/select/SelectTrigger.vue` | `text-sm` → `text-[13px]`, `data-[size=default]:h-9` → `h-[32px]`, `data-[size=sm]:h-8` → `h-[26px]`, dropped `shadow-xs` and `py-2` | `:root` is 13px, so `text-sm` resolved to 11.4px and `h-9` to 29.25px — neither is the app's 13px/32px control metric |

Re-check both patches after every `shadcn-vue add` or `shadcn-vue diff`.

## Verification

Run frontend and Rust checks on upgrade; verify browser and bundled offline behavior, Chinese composition, code/table undo, math, image paths, Mermaid copy/presentation and source round trips. No highlighter DOM is serialized into Markdown.

## 2026-09-21 — Complete owned shadcn-vue controls and minimalist workspace

- Source: official shadcn-vue `new-york` registry via CLI (`dropdown-menu`, `combobox`, `button`, `input`, `textarea`, `checkbox`, `switch`); Reka UI 2.10.4 remains the implementation dependency, only imported inside `src/components/ui/`.
- Changed copied files: all Select files formatted; SelectTrigger/Item/ScrollUpButton/ScrollDownButton icons now Phosphor Bold; SelectContent retains token layering and subdued token shadow. New DropdownMenu and Combobox content use `--y-z-modal-top`, omit stock animation classes and heavy shadows. Icons in their copied files and Checkbox use Phosphor Bold. Switch uses explicit 30×18 geometry, 14px nonshrinking thumb and zero native button padding. Checkbox also resets native padding. Button adds compact desktop sizing and defaults to ghost; Input and Textarea use desktop typography. ComboboxInput is a compact inline text field without a redundant search icon.
- Rationale: preflight remains off to protect document DOM; stock native button padding otherwise clips switch thumbs. Overlay tokens resolve on body portals in light/dark themes and above settings dialogs. No upstream package monkey patches.
- App integration: all authored native selects/datalists replaced by owned Select/Combobox. Editable model input preserves custom IDs. Document and browser menu actions use non-modal DropdownMenu so outside clicks close the menu and reach the intended control. Buttons and text fields migrate across app settings/AI/find/palette surfaces; virtual tree, adapter DOM, numeric/range controls and AppDialog remain specialized.
- Upgrade checks: outside pointer/focus + Escape dismissal, keyboard selection, disabled actions, free-text model round-trip, IME Enter, modal picker layering, theme recoloring, preserved document layout, switch geometry without preflight. See tests/ui-controls.test.ts, tests/ai-panel.test.ts and tests/settings-select.test.ts.

## 2026-09-22 — Review round: dismissal, chrome metrics, owned controls

- `DropdownMenu :modal="false"` removed from both `EditorShell.vue` menus. Non-modal Reka menus never let the runtime settle — the outside-pointer dismissal is deferred onto a timer that no longer runs, so the menu stayed open. Modal (the default) restores outside-click, focus return and Escape. jsdom cannot observe the first two at all; see below.
- `tests/settle.ts`: jsdom stalls its timer phase as soon as a Reka portal overlay exists, so `flushPromises`/`vi.waitFor` never resume after one and the test is reported as timed out even though it finished. Overlay-touching tests settle on microtasks and raise their own timeout; outside-click dismissal and focus return moved to `scripts/ui-check.mjs` (`pnpm ui:check`), which drives real Chrome over CDP with no new dependency.
- Chrome metrics: `--y-titlebar-h` 40 → 36px and now also sets the sidebar tab strip and the AI panel header, so the three chrome rows share one band. macOS traffic lights re-centred for the new height (`trafficLightPosition` y 18 → 12, in `tauri.conf.json` and `windows.rs`). The titlebar carries the workspace folder name next to the centred document title.
- `--y-danger` was 4.47:1 on the panel (AA needs 4.5): `#c8443c` → `#bc3a33` light, `#e06c62` → `#e5796f` dark. The five hard-coded `#b45534` error colours collapsed into `var(--y-danger)`.
- All remaining native `<input type="checkbox">` replaced by the owned `Checkbox` (find bar, resources panel, resource dialog, command palette, AI panel history and diff hunks). Two of them are index-array groups; the owned checkbox is boolean, so they keep the array through an explicit toggle rather than `v-model`. `tests/ui-controls.test.ts` now bans `type="checkbox"` in `src/` so the rule is testable.
- `shortcutLabel()` in `command-palette/registry.ts` renders stored combos as ⌘⇧N for the menus and the palette; the stored `Mod+Shift+n` spelling is unchanged. The palette no longer puts a command's category in the key chip.
- Test-only: `scripts/ui-check.mjs` needs Chrome and a running dev server, so it is `pnpm ui:check`, not part of `pnpm test` — the same opt-in shape as `scripts/test-provider-live.mjs`.
