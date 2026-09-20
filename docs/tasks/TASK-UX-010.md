# TASK UX-010 — Second editor refinement pass

Implements the user's ten requests on 2026-09-18, after TASK-UX-016.

- Half-size status icons/buttons; width drag integer normalization in Vue and Rust.
- Unobstructed error dismissal and transparent wide-mode button with icon-only hover color.
- Explicit three-mode palette, Tab/Shift+Tab cycling, 搜索命令 label.
- File-result context actions: copy path, reveal, system open, trash with dirty-document protection.
- Regex content search and preferences: default enabled, default 70 results, adjustable 1–1000.
- Command transliteration/initials, theme switching, shortcut preferences navigation.
- Automatic large Mermaid rendering by default; optional 点击渲染图表 gate.
- Editor context menu: table picker and alignment, lists/tasks, local date/time and Unix timestamp; retains common editing actions.
- Table row/column toolbar, Shift+Enter row and Ctrl/Cmd+Enter column insertion.
- Deferred feature bundles, immediate startup status and native window reveal on page completion.

Validation includes UI tests for fractional drag, native configuration decoding, palette modes/limits/actions, pinyin, Mermaid auto/manual rendering and table mutations/keyboard events. Browser smoke covers table creation, alignment serialization and undo; command settings navigation; close-button hit testing; large-diagram modes. macOS is locked during this pass, so new native UI behavior cannot be verified through automation. Windows runtime verification is not claimed.
