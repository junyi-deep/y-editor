# y-editor development

1. Read `docs/IMPLEMENTATION_PLAN.md`, the current task card and relevant ADRs first.
2. Keep Tauri 2, Vue 3, TypeScript, Pinia and Milkdown per ADR-0006. No substitute editor/runtime without an ADR.
3. Only `src/editor/adapter/` may import the editor engine. Record integrations in `PATCHES.md`.
3b. UI controls come from `src/components/ui/` (shadcn-vue source, copied and owned) styled by Tailwind per ADR-0007: `--y-*` tokens stay the source of truth, preflight stays off, overlay z-indexes use the `--y-z-*` tokens rather than Tailwind `z-N`, and every edit to a copied component is logged in `PATCHES.md`. The editor's own DOM, CodeMirror surfaces, the virtualised file tree and `AppDialog.vue` are not migrated.
4. Vue must not receive arbitrary filesystem or shell access. Rust enforces canonicalized workspace boundaries.
5. Persist settings, metadata, sessions and credentials in executable-sibling `.yeditor/data.db` (SQLite), per ADR-0005. Never expose keys to Vue, logs, source control or packaged fixtures. No legacy JSON migration. Resource files live in `.yeditor/res/{type}` except referenced knowledge/repository folders.
6. Add tests for new behavior. Public architecture changes require an ADR; settings schema changes require a migration.
7. Update `docs/TYPORA_PARITY.md` when implementing a parity feature.
8. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and Rust fmt, clippy and test with `--manifest-path src-tauri/Cargo.toml`.
9. Follow the task order in the plan. TASK-001 must not implement AI, Knowledge, MCP or Theme Editor.

<!-- CODEGRAPH_START -->
## CodeGraph

When `.codegraph/` exists, use `codegraph explore "<symbols or question>"` (or the CodeGraph MCP tool) before grep/find or reading code to understand or locate it. If absent, skip CodeGraph; do not index automatically.
<!-- CODEGRAPH_END -->

Current task: `docs/tasks/TASK-20260920.md`. Current product requirements: `dev-prompts/开发提示词_20260920.md`. Earlier requirements in `dev-prompts/开发提示词_20260918.md` contain a private test credential; never copy it to source or logs.

## Current architecture and regression notes

- Settings schema 6: native SQLite records, opacity and attachment preferences; global resource enabled values seed a new workspace's independent resource map. Credentials never have a read-to-frontend IPC.
- AI: bundled Pi RPC with explicitly bounded host tools. Conversations are keyed by workspace and ID; foreign-workspace conversations get new IDs on fork. Images live in res/chat-images, referenced from SQL. Markdown chat output disables raw HTML and remote images.
- Editor: keep context/table/attachment/diagram integration within the adapter. Milkdown owns the document; CodeMirror node views update code through ProseMirror transactions. Never serialize the decorated editor DOM as Markdown. Host command registry owns remapped shortcuts.
- Windows: resolve workspace/AI/recovery from trusted IPC window identity. Emit document, watcher and AI events only to that window. Settings/resources share SQLite and process-wide locks. Folder opening creates another window.
- Release validation: pnpm test:ai exercises the real sidecar against local fixtures. scripts/test-provider-live.mjs is a separate explicit private-provider test; it reads the ignored specification and only reports success flags.
- Portable packaging uses temporary staging and excludes .yeditor. It must not delete the existing expanded portable app/data directory. On macOS the executable-sibling data directory is inside Contents/MacOS; remind users to preserve it when replacing the application.
