# TASK-001 — Bootstrap y-editor

Goal: build and launch the Tauri/Vue Markdown editor skeleton on macOS and Windows.

Scope: Tauri 2, Vue 3, strict TypeScript, Vite, Pinia, Vditor IR; left/editor/right/status layout; demo Markdown; read-only Rust metadata IPC; offline editor resources; frontend/Rust checks; macOS and Windows CI.

Non-goals: real filesystem operations, settings persistence, AI, Knowledge, MCP, Theme Editor, release packaging. This is not the 0.1.0 MVP.

Files: `src/app/`, `src/editor/`, `src/stores/`, `src/services/`, `src-tauri/src/commands/`, `scripts/prepare-editor.mjs`, `.github/workflows/ci.yml`.

Acceptance: `pnpm dev`, `pnpm tauri dev`, `pnpm build` and `cargo test --manifest-path src-tauri/Cargo.toml`; lint, typecheck, tests, fmt and clippy pass. Real editor loads without a CDN, accepts input and preserves text through appearance/panel changes. GitHub CI checks both desktop targets; remote results cannot be claimed until pushed.

Tests: document versions/dirty state, fenced-code outline exclusion, Unicode statistics, adapter options/lifecycle/input/loading failure, shell panel/theme controls, Rust serialized IPC contract.

## Local verification — 2026-09-16

- macOS ARM64: `pnpm lint`, `pnpm typecheck`, `pnpm test` (10 tests), `pnpm build` passed.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (1 contract test) passed.
- `pnpm install --frozen-lockfile --offline` accepted the lockfile.
- `pnpm dev`: Vite served the app; real browser smoke check covered IR load, typing, light/dark switching, outline and status updates. No browser warning/error logs in the smoke run.
- `pnpm tauri dev --no-watch`: compiled and launched `target/debug/y-editor`; native window interaction was not verified because the Mac was locked.
- Windows and GitHub Actions execution are pending. This directory has no `.git` repository or remote; the workflow is prepared but has not run on GitHub.
- `pnpm tauri build --no-bundle`: macOS ARM64 release compilation passed (2m 11s); local binary produced. This is a compile check, not a signed or portable release.
