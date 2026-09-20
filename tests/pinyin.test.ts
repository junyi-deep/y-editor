import { it, expect } from "vitest";
import { searchCommands } from "../src/command-palette/pinyin";
const commands = [
  {
    id: "settings.shortcuts",
    title: "查看快捷键",
    category: "视图",
    execute: () => {},
  },
  {
    id: "theme.preset.github",
    title: "切换主题：GitHub",
    category: "主题",
    execute: () => {},
  },
];
it("matches Chinese, full pinyin, initials and English names", () => {
  for (const q of ["查看", "chakankuaijiejian", "ckkjj"])
    expect(searchCommands(commands, q)[0]?.id).toBe("settings.shortcuts");
  expect(searchCommands(commands, "qiehuanzhuti")[0]?.id).toBe(
    "theme.preset.github",
  );
  expect(searchCommands(commands, "github")[0]?.id).toBe("theme.preset.github");
});
const shortcutCommands = [
  {
    id: "file.save",
    title: "保存",
    category: "文件",
    shortcut: "Mod+s",
    execute: () => {},
  },
  {
    id: "file.quickOpen",
    title: "快速打开…",
    category: "文件",
    shortcut: "Mod+Shift+p",
    execute: () => {},
  },
];
it("matches a shortcut however the user writes the modifier", () => {
  for (const query of [
    "mod+s",
    "mod s",
    "mods",
    "cmd+s",
    "cmd s",
    "command s",
    "⌘S",
    "control s",
  ])
    expect(searchCommands(shortcutCommands, query)[0]?.id).toBe("file.save");
  for (const query of ["ctrl+shift+p", "cmd shift p", "mod+shift+p"])
    expect(searchCommands(shortcutCommands, query)[0]?.id).toBe(
      "file.quickOpen",
    );
  expect(searchCommands(shortcutCommands, "保存")[0]?.id).toBe("file.save");
  expect(searchCommands(shortcutCommands, "meiyoushurujian")).toHaveLength(0);
});
it("matches pinyin that runs into a Latin word in the title", () => {
  expect(searchCommands(commands, "qiehuanzhutigithub")[0]?.id).toBe(
    "theme.preset.github",
  );
});
