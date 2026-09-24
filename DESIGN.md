---
name: y-editor
description: Minimalist desktop Markdown writing and document-aware AI assistance.
colors:
  bg: "#ffffff"
  panel: "#f7f6f3"
  text: "#2f3437"
  muted: "#706e69"
  border: "#eaeaea"
  hover: "#efeeeb"
  accent: "#4183c4"
  accent-ink: "#1b1b1b"
  danger: "#bc3a33"
  selected: "#e3e3e3"
  dark-bg: "#232323"
  dark-panel: "#292929"
  dark-text: "#d4d4d4"
  dark-muted: "#999999"
  dark-border: "#3d3d3d"
  dark-hover: "#353535"
  dark-accent: "#79a9dc"
  dark-danger: "#e5796f"
  dark-selected: "#414141"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "13px"
  label:
    fontSize: "12px"
  metadata:
    fontSize: "11px"
  panel-title:
    fontSize: "14px"
  modal-title:
    fontSize: "17px"
  editor:
    fontFamily: "sans-serif"
    fontSize: "16px"
    lineHeight: 1.6
  code:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "13px"
    lineHeight: 1.65
rounded:
  sm: "4px"
  control: "6px"
  conversation: "8px"
  popover: "10px"
  window: "12px"
spacing:
  model-gap: "6px"
  composer-padding: "10px"
  panel-inset: "12px"
  transcript-inset: "16px"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
  button-ghost:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
  input:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  composer:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.conversation}"
    padding: "10px"
  titlebar:
    height: "36px"
  statusbar:
    height: "26px"
---
# Design System: y-editor

## Overview

**Creative North Star: "Minimalist desktop writing workspace"**

A quiet, compact desktop workspace leaves room for Markdown and reviewable AI edits. Warm neutral panels, fine borders, charcoal actions, system typography and Phosphor Bold icons carry the user-selected minimalist direction. Operate mode prioritizes writing, finding, comparing and applying changes.

This documents the implemented system, not a new visual identity. Runtime themes and editor typography remain user choices. No marketing composition or imagery belongs in the writing workspace.

**Key Characteristics:**

- Compact chrome around a dominant document.
- Flat surfaces with restrained overlay shadows.
- Owned controls and shared runtime tokens.
- Editable starter prompts and explicit approval modes.

## Colors

The frontmatter records the runtime Typora light/dark preset from `src/settings/themes.ts`, plus selection and danger colors from `src/app/styles.css`. Warm paper panels support neutral text and a restrained blue accent. These are the default preset values, not a replacement palette for the other seven presets (Atom One, ChatGPT App, GitHub, JetBrains, VS Code, Nord and Dracula).

`bg`, `panel`, `text`, `muted`, `border`, `hover` and `accent` map to the corresponding `--y-*` names. The `dark-` prefix records the same roles in dark mode. `accent-ink` is luminance-selected by the theme function; do not assume white on blue. CSS fallback colors differ from the runtime preset, which takes precedence. `danger` denotes destructive/error feedback; `selected` is the neutral active-tab surface.

**The Runtime Token Rule.** Resolve colors through `--y-*`, including in body-portalled overlays. Tailwind primary maps to `--y-accent`; Tailwind accent maps to the hover surface `--y-hover`.

## Typography

System UI type is the chrome voice; Chinese fallbacks are part of its stack. The root is 13px. The observed UI scale is 10px auxiliary hints, 11px metadata, 12px chrome, 13px controls, 14px panel titles and 17px modal titles. The AI welcome heading is 15px/1.4 at weight 600; settings section headings are 19px. There is no marketing display face.

Editor defaults are 16px/1.6 sans-serif with an 800px width token, all configurable. CodeMirror uses SFMono-Regular/Consolas/monospace at 13px/1.65. Do not apply chrome sizing to document content. Key hints use a system monospace stack at 11px.

## Layout

The shell fills 100dvh and contains a 36px titlebar, optional file pane, central document, optional AI pane, and a 26px status bar. Sidebar tabs and the AI header share the titlebar height token. Controls use 28px and 20px role metrics; virtualized file rows use the shared 31px row token. Native macOS chrome reserves 84px on the left for traffic lights; browser preview is not native-window proof.

The document uses 44px top padding, a responsive horizontal inset based on the editor width token and 100px bottom padding. At 900px or narrower its padding becomes 40px 24px 80px and the document title hides. Settings fit min(860px, 94vw) by min(680px, 88vh), with a 154px navigation rail and independently scrolling content. At 700px the rail is 112px, rows wrap and the non-fullscreen AI pane is capped at 55vw. At an AI container width of 300px the connection picker moves above the model row. These are desktop adaptations, not a mobile-product commitment.

## Elevation & Depth

Fine borders and tonal changes define resting surfaces. All three shadow tokens currently share `0 4px 16px rgb(0 0 0 / 0.04)`, used for overlays rather than a hierarchy of floating cards. Backdrops are theme-aware; dialogs remain distinct from anchored menus.

The z-index ladder is chrome 5, float 20, menu 90, popover 100, modal 200 and modal-top 300, exposed as `--y-z-*`. Keep portal colors mirrored on the document root. State transitions use `120ms ease`; table reorder uses a 180ms transform animation with `cubic-bezier(0.16, 1, 0.3, 1)`. CSS animations/transitions and the table animation respect reduced motion. These are functional feedback, not entrance choreography.

## Shapes

Small details use 4px radii, controls 6px, the composer and user messages 8px, generic popovers 10px and the window 12px. Owned select/dropdown/combobox overlays have a desktop override of 8px. Maximized windows remove outer rounding. The composer has a 1px border and 10px padding; user messages use a subtle text-tinted fill while assistant messages remain in the transcript flow.

## Components

Use the copied, owned shadcn-vue components under `src/components/ui/`, backed by Reka accessibility behavior. Tailwind imports theme and utilities only; its inline theme bridges runtime tokens. Every copied-component edit belongs in `PATCHES.md`. Per ADR-0007, Milkdown/CodeMirror surfaces, adapter-generated DOM, the virtualized file tree, titlebar drag regions and `AppDialog.vue` keep their specialized implementations.

- **Buttons:** the owned default is ghost/compact. `.primary` actions use text-colored fill and background-colored ink with no shadow; the explicit shadcn default variant remains accent-filled. Outline, secondary, destructive and link variants remain available. Hover changes fill or opacity; ordinary keyboard focus has a 2px accent outline offset by 2px. Keep disabled states visible.
- **Inputs and pickers:** 6px corners, token borders and system text. Model identifiers accept custom text through the owned combobox. Dropdowns use 30px minimum item height and 13px text, dismiss on outside interaction/Escape, and restore focus through Reka.
- **Navigation:** compact rounded tabs use the neutral selected surface; file rows use an accent-tinted fill. Settings use a fixed rail and ruled 48px minimum rows, not a card dashboard.
- **Composer:** a distinct bordered field below a flexible transcript. Starter actions insert text and focus without sending. `@` references and `/` commands appear in an anchored popover above it, offset 8px, with keyboard navigation. Shift+Enter inserts a newline, including while suggestions are open; IME composition must not send. Current-document/thinking controls share the footer with send/stop. The textarea uses the composer's focus-within border feedback rather than its own outline.
- **Approval:** `request` shows differences for approval; `assist` auto-applies conflict-free current-document proposals and asks for other files; `full` auto-applies conflict-free workspace proposals. These labels never grant shell access or remove workspace/tool boundaries. Mode selection sits below the composer.
- **Sessions:** a separate searchable session browser dialog fits min(640px, 100vw - 32px), with a bounded scrolling results region. It does not replace the active transcript with an inline history dump.
- **Editor feedback:** cell selection, source/target drag marks and a reorder hint accompany table dragging. Reordered cells animate from their prior geometry only after an actual move. Selection locations are derived from serialized editor state and mapped back to preserved Markdown; formatting differences may cause mapping to return no range. This is source-position metadata, not a visible minimap. Context-menu shortcut hints follow the host command bindings. Mermaid exits editing on outside interaction, Escape or Mod+Enter.

## Do's and Don'ts

- Do use --y-* tokens and the owned controls in src/components/ui/.
- Do preserve selectable themes, readable focus states and reduced motion.
- Do keep starter actions editable and show approval mode beside the composer.
- Do record copied-component changes in PATCHES.md.
- Don't enable Tailwind preflight or assign Tailwind z-N values to overlays.
- Don't replace the editor DOM, CodeMirror, virtualized file tree or AppDialog.vue with generic UI wrappers.
- Don't invent conversations, native screenshots or successful provider activity as design evidence.
- Don't add decorative gradients, heavy shadows or marketing card grids to the workspace.
