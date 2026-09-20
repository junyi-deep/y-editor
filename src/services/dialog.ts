import { shallowRef } from "vue";
export interface Choice {
  id: string;
  label: string;
  primary?: boolean;
}
interface Dialog {
  title: string;
  message: string;
  choices: Choice[];
  input?: string;
  resolve: (value: string | null) => void;
}
export const dialog = shallowRef<Dialog | null>(null);
export function choose(
  title: string,
  message: string,
  choices: Choice[],
  input?: string,
): Promise<string | null> {
  if (dialog.value) return Promise.resolve(null);
  return new Promise((resolve) => {
    dialog.value = { title, message, choices, input, resolve };
  });
}
export function finishDialog(value: string | null) {
  const current = dialog.value;
  dialog.value = null;
  current?.resolve(value);
}
