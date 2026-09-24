# ADR 0009: Conversation approval policy and source selection ranges

Accepted 2026-09-23 for the user-requested v0.0.4 release.

The conversation owns a volatile approval mode: request (every proposal reviewed), assist (only conflict-free changes to the active document), or full (conflict-free proposals within the workspace). New and loaded conversations start in request mode. Changing modes does not approve old pending proposals. Mode, conversation, workspace, and document identity are checked before queued work runs. Full mode does not enable arbitrary shell access or override canonical workspace checks and existing tool permissions. No persistent settings schema change is needed.

Manual and automatic acceptance share one store action: three-way merge against the current in-memory document, or the existing bounded Rust apply_file_patch IPC for another file. Conflicts and failed writes leave a proposal pending with a visible error. An in-flight guard prevents duplicate application. Proposal changes persist through the existing conversation SQL path.

EditorSelection optionally provides rangeLabel through getSelection(true). Line numbers are one-based and columns zero-based UTF-16 offsets, matching CodeMirror and JavaScript selection offsets. Source mode uses exact offsets; rich text serializes a detached marker transaction and maps serializer normalization back to preserved Markdown. This preserves repeated text locations without mutating the document or introducing an undo step. All engine imports and table/diagram integrations remain in the adapter.

Owned shadcn-vue Dialog provides the separate session browser; Popover anchors command/file suggestions above the composer. Dialog and Popover are internal Reka consumers and inherit the existing token/z-index architecture.
