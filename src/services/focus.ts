import { onMounted, onBeforeUnmount } from "vue";
export function trapDialogTab(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const root = event.currentTarget as HTMLElement;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
    ),
  ).filter((el) => el.getClientRects().length);
  const first = items[0],
    last = items.at(-1);
  if (!first) return;
  if (
    event.shiftKey &&
    (document.activeElement === first || !root.contains(document.activeElement))
  ) {
    event.preventDefault();
    last?.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || !root.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}

export function useDialogEscape(
  root: () => HTMLElement | undefined,
  close: () => unknown,
) {
  const key = (event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      !root()?.isConnected
    )
      return;
    const dialogs = Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"],dialog[open]'),
    );
    const top = dialogs.at(-1);
    if (top && top !== root() && !root()?.contains(top)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };
  onMounted(() => document.addEventListener("keydown", key));
  onBeforeUnmount(() => document.removeEventListener("keydown", key));
}
