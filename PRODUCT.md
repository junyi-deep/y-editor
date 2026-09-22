# y-editor

<!-- impeccable:product-schema 1 -->

## Platform

web

Vue surfaces hosted by Tauri 2 on desktop; browser preview cannot execute native IPC.

## Product Purpose

Local-first Markdown writing with document-aware AI assistance. Existing product truth is specified in docs/IMPLEMENTATION_PLAN.md and the current task card, with later ADRs taking precedence.

## Operating Context

Markdown editing, file navigation, document search, model connections, workspace resources, AI conversation and reviewable document patches. Keep the existing navigation and terminology.

## Capabilities and Constraints

Tauri 2, Vue 3, TypeScript, Pinia and Milkdown. Editor integration stays in src/editor/adapter. Rust owns filesystem boundaries and native operations. SQLite stores settings and credentials; secrets are never returned to Vue. The owned shadcn-vue component layer uses Tailwind without preflight. Reka UI remains its underlying accessibility dependency.

## Brand Commitments

The user's 2026-09-21 brief explicitly requests minimalist-ui, compact titlebars, a redesigned AI panel, shadcn-vue controls and impeccable review. No marketing layouts or imagery in the writing workspace.

## Open Decisions

Primary audience beyond the Markdown/AI workflows in the repository is unspecified. No persistent image-first/code-first workflow preference has been confirmed.
