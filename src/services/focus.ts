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
