import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAiStore } from "../src/stores/ai";
import { useWorkspaceStore } from "../src/stores/workspace";
const mock = vi.hoisted(() => ({
  call: vi.fn(),
  event: null as null | ((value: unknown) => void),
}));
vi.mock("../src/services/backend", () => ({
  desktop: true,
  call: mock.call,
  backend: { settings: vi.fn(async () => {}) },
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: vi.fn(async (_: string, fn: (value: unknown) => void) => {
      mock.event = fn;
      return () => {};
    }),
  }),
}));
beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  mock.call.mockReset();
  mock.call.mockImplementation(async (command: string) =>
    command === "ai_start" ? 7 : command === "ai_history_list" ? [] : undefined,
  );
});
afterEach(() => {
  useAiStore().dispose();
  vi.useRealTimers();
});
const snapshot = { content: "# current", dirty: false, version: 1 };
it("sends removable reference context and images, then clears consumed references", async () => {
  const ai = useAiStore();
  ai.references = [{ id: "r", label: "Line1~3", text: "graph TD\nA-->B" }];
  ai.thinking = true;
  const images = [
    { type: "image" as const, mimeType: "image/png", data: "cG5n" },
  ];
  await ai.send("Explain", snapshot, "", false, images);
  expect(mock.call).toHaveBeenCalledWith(
    "ai_send",
    expect.objectContaining({
      message: expect.stringContaining("Line1~3"),
      thinking: true,
      images,
    }),
  );
  expect(ai.references).toEqual([]);
  expect(ai.messages[0].images).toEqual(images);
});
it("keeps reasoning separate and records provider usage and failure messages", async () => {
  const ai = useAiStore();
  await ai.send("Hello", snapshot, "", false);
  const emit = (event: unknown) =>
    mock.event?.({ payload: { session: 7, event } });
  emit({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "Consider" },
  });
  emit({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "Answer" },
  });
  emit({
    type: "message_end",
    message: { usage: { input: 10, output: 20, cacheRead: 5 } },
  });
  expect(ai.messages.at(-1)).toMatchObject({
    text: "Answer",
    reasoning: "Consider",
  });
  expect(ai.inputTokens).toBe(15);
  expect(ai.outputTokens).toBe(20);
  emit({
    type: "message_end",
    message: { stopReason: "error", errorMessage: "Connection failed" },
  });
  expect(ai.error).toBe("Connection failed");
  expect(ai.busy).toBe(false);
});
it("forks another workspace conversation and persists under the current workspace", async () => {
  useWorkspaceStore().root = "/current";
  const ai = useAiStore();
  mock.call.mockImplementation(async (command: string) =>
    command === "ai_history_load"
      ? {
          workspace: "/other",
          messages: [{ role: "user", text: "Old" }],
          patches: [],
        }
      : [],
  );
  await ai.loadHistory("old-id", true);
  expect(ai.conversationId).not.toBe("old-id");
  await ai.persist();
  expect(mock.call).toHaveBeenCalledWith(
    "ai_history_save",
    expect.objectContaining({
      conversation: expect.objectContaining({
        workspace: "/current",
        messages: [{ role: "user", text: "Old" }],
      }),
    }),
  );
});
