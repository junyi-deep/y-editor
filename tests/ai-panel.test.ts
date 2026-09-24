import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import { Select } from "../src/components/ui/select";
import AiPanel from "../src/ai/AiPanel.vue";
import { useSettingsStore } from "../src/stores/settings";
import { useWorkspaceStore } from "../src/stores/workspace";
import { settle } from "./settle";

const mocks = vi.hoisted(() => ({
  imageRead: vi.fn(async () => "data:image/png;base64,QUJD"),
  listFiles: vi.fn(async () => [
    {
      name: "note.md",
      relative: "note.md",
      path: "/ws/note.md",
      directory: false,
    },
    {
      name: "shot.png",
      relative: "shot.png",
      path: "/ws/shot.png",
      directory: false,
    },
  ]),
  readDocument: vi.fn(async () => ({ content: "文档正文" })),
  models: vi.fn(async () => ["m-a", "m-b"]),
}));
vi.mock("../src/services/backend", () => ({
  desktop: false,
  call: vi.fn(async (command: string, args?: unknown) => {
    if (command === "image_read") return mocks.imageRead(args);
    if (command === "list_files") return mocks.listFiles();
    if (command === "read_document") return mocks.readDocument(args);
    if (command === "ai_models") return mocks.models();
    return [];
  }),
  backend: { settings: vi.fn(async () => null) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

async function open() {
  const wrapper = mount(AiPanel, {
    props: { selection: "" },
    attachTo: document.body,
  });
  await settle();
  return wrapper;
}

it("leaves the composer usable without a separate enable step", async () => {
  const settings = useSettingsStore();
  expect(settings.value.ai.enabled).toBe(false);
  const wrapper = await open();
  const textarea = wrapper.get("textarea");
  expect((textarea.element as HTMLTextAreaElement).disabled).toBe(false);
  expect(wrapper.get(".ai-actions").exists()).toBe(true);
  wrapper.unmount();
});

it("keeps a model typed in the panel when the connection is switched away and back", async () => {
  const settings = useSettingsStore();
  const provider = (name: string, model: string) => ({
    enabled: true,
    protocol: "openai-compatible",
    baseUrl: "https://example.test/v1",
    model,
    apiKeyRef: `provider:${name}`,
  });
  settings.value.providerProfiles = [
    { name: "A", provider: provider("a", "m-a") },
    { name: "B", provider: provider("b", "m-b") },
  ];
  settings.value.ai = { ...provider("a", "m-a") };
  const wrapper = await open();
  const model = wrapper.get<HTMLInputElement>("input[aria-label='AI 模型']");
  await model.setValue("typed-model");
  await model.trigger("change");
  await model.trigger("keydown", { key: "Escape" });
  await settle();
  const select = wrapper.findComponent(Select);
  select.vm.$emit("update:modelValue", "provider:b");
  await settle();
  expect(settings.value.ai.model).toBe("m-b");
  select.vm.$emit("update:modelValue", "provider:a");
  await settle();
  expect(settings.value.ai.model).toBe("typed-model");
  wrapper.unmount();
});

it("does not send on the Enter that commits an IME candidate", async () => {
  const { useAiStore } = await import("../src/stores/ai");
  const ai = useAiStore();
  const send = vi.spyOn(ai, "send").mockResolvedValue(undefined);
  const wrapper = await open();
  const textarea = wrapper.get("textarea");
  await textarea.setValue("中文输入");
  await textarea.trigger("keydown", { key: "Enter", isComposing: true });
  expect(send).not.toHaveBeenCalled();
  await textarea.trigger("keydown", { key: "Enter" });
  expect(send).toHaveBeenCalledOnce();
  wrapper.unmount();
});
it("references an image through @ instead of an upload control", async () => {
  const workspace = useWorkspaceStore();
  workspace.root = "/ws";
  const wrapper = await open();
  expect(wrapper.find("input[type=file]").exists()).toBe(false);
  const textarea = wrapper.get("textarea");
  await textarea.trigger("focus");
  await textarea.setValue("看图 @shot");
  await settle();
  const choices = document.querySelectorAll<HTMLButtonElement>(
    ".ai-suggestions button",
  );
  expect(choices).toHaveLength(1);
  expect(wrapper.get("form").element.contains(choices[0])).toBe(false);
  choices[0].click();
  await settle();
  expect(mocks.imageRead).toHaveBeenCalledWith({
    documentPath: "/ws/shot.png",
    source: "/ws/shot.png",
  });
  expect(mocks.readDocument).not.toHaveBeenCalled();
  const chips = wrapper.findAll(".ai-references span");
  expect(chips).toHaveLength(1);
  expect(chips[0].find("img").exists()).toBe(true);
  expect(textarea.element.value).toBe("看图 ");
  wrapper.unmount();
});

it("shows changes immediately and enables approval without an extra review click", async () => {
  const { useAiStore } = await import("../src/stores/ai");
  const { useDocumentStore } = await import("../src/stores/document");
  const doc = useDocumentStore();
  doc.content = "before\n";
  const ai = useAiStore();
  ai.receivePatch({ path: "", original: "before\n", proposed: "after\n" });
  const wrapper = await open();
  const accept = wrapper
    .findAll("button")
    .find((b) => b.text() === "接受修改")!;
  expect((accept.element as HTMLButtonElement).disabled).toBe(false);
  await accept.trigger("click");
  expect(doc.content).toBe("after\n");
  expect(ai.patches[0].status).toBe("accepted");
  wrapper.unmount();
});
it("opens session search in a separate dialog and dismisses it with Escape", async () => {
  const wrapper = await open();
  await wrapper.get('button[title^="会话列表"]').trigger("click");
  await settle();
  const search = document.querySelector<HTMLInputElement>(
    '[aria-label="搜索会话"]',
  );
  expect(search).not.toBeNull();
  expect(wrapper.element.contains(search)).toBe(false);
  search!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await settle();
  expect(document.querySelector('[aria-label="搜索会话"]')).toBeNull();
  wrapper.unmount();
});

it("keeps Shift+Enter as a newline while command suggestions are open", async () => {
  const { useAiStore } = await import("../src/stores/ai");
  const ai = useAiStore();
  const reset = vi.spyOn(ai, "reset").mockResolvedValue(undefined);
  const wrapper = await open();
  const textarea = wrapper.get("textarea");
  await textarea.trigger("focus");
  await textarea.setValue("/");
  await settle();
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  textarea.element.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(reset).not.toHaveBeenCalled();
  expect(textarea.element.value).toBe("/");
  wrapper.unmount();
});
