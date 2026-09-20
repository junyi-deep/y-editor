export function normalizeShortcut(value: string) {
  return value
    .toLowerCase()
    .replace(/cmdorctrl|commandorcontrol/g, "mod")
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("+");
}
export function eventShortcut(event: KeyboardEvent) {
  if (
    ["Control", "Meta", "Shift", "Alt"].includes(event.key) ||
    event.isComposing
  )
    return null;
  const key = /^(Key[A-Z]|Digit[0-9])$/.test(event.code)
    ? event.code.replace(/^(Key|Digit)/, "").toLowerCase()
    : event.key === " "
      ? "Space"
      : event.key.length === 1
        ? event.key.toLowerCase()
        : event.key;
  return [
    ...(event.ctrlKey || event.metaKey ? ["Mod"] : []),
    ...(event.altKey ? ["Alt"] : []),
    ...(event.shiftKey ? ["Shift"] : []),
    key,
  ].join("+");
}
export function matchesShortcut(value: string, event: KeyboardEvent) {
  return (
    normalizeShortcut(value) === normalizeShortcut(eventShortcut(event) ?? "")
  );
}
