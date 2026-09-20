export const themePresets = [
  {
    id: "typora",
    name: "Typora",
    light: [
      "#ffffff",
      "#f8f8f8",
      "#333333",
      "#888888",
      "#e5e5e5",
      "#eeeeee",
      "#4183c4",
    ],
    dark: [
      "#232323",
      "#292929",
      "#d4d4d4",
      "#999999",
      "#3d3d3d",
      "#353535",
      "#79a9dc",
    ],
  },
  {
    id: "atom",
    name: "Atom One",
    light: [
      "#fafafa",
      "#f0f0f0",
      "#383a42",
      "#8a8a8a",
      "#dddddd",
      "#e5e5e6",
      "#4078f2",
    ],
    dark: [
      "#282c34",
      "#21252b",
      "#abb2bf",
      "#7f848e",
      "#3e4451",
      "#3e4451",
      "#61afef",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT App",
    light: [
      "#ffffff",
      "#f9f9f9",
      "#0d0d0d",
      "#6b6b6b",
      "#e5e5e5",
      "#ececec",
      "#02856f",
    ],
    dark: [
      "#212121",
      "#171717",
      "#ececec",
      "#a6a6a6",
      "#3e3e3e",
      "#2f2f2f",
      "#5dc4af",
    ],
  },
  {
    id: "github",
    name: "GitHub",
    light: [
      "#ffffff",
      "#f6f8fa",
      "#1f2328",
      "#656d76",
      "#d0d7de",
      "#eaeef2",
      "#0969da",
    ],
    dark: [
      "#0d1117",
      "#161b22",
      "#e6edf3",
      "#8b949e",
      "#30363d",
      "#21262d",
      "#58a6ff",
    ],
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    light: [
      "#ffffff",
      "#f7f8fa",
      "#27282e",
      "#6c707e",
      "#d3d5db",
      "#edf3ff",
      "#3574f0",
    ],
    dark: [
      "#1e1f22",
      "#2b2d30",
      "#bcbec4",
      "#868a91",
      "#43454a",
      "#393b40",
      "#548af7",
    ],
  },
  {
    id: "vscode",
    name: "VS Code",
    light: [
      "#ffffff",
      "#f3f3f3",
      "#333333",
      "#777777",
      "#dddddd",
      "#e8e8e8",
      "#007acc",
    ],
    dark: [
      "#1e1e1e",
      "#252526",
      "#d4d4d4",
      "#858585",
      "#3e3e42",
      "#2a2d2e",
      "#4fc1ff",
    ],
  },
  {
    id: "nord",
    name: "Nord",
    light: [
      "#eceff4",
      "#e5e9f0",
      "#2e3440",
      "#687387",
      "#d8dee9",
      "#d8dee9",
      "#5e81ac",
    ],
    dark: [
      "#2e3440",
      "#3b4252",
      "#eceff4",
      "#a6afc0",
      "#4c566a",
      "#434c5e",
      "#88c0d0",
    ],
  },
  {
    id: "dracula",
    name: "Dracula",
    light: [
      "#f8f8f2",
      "#efedf5",
      "#282a36",
      "#797089",
      "#ded9e8",
      "#e8e2f0",
      "#7953b2",
    ],
    dark: [
      "#282a36",
      "#21222c",
      "#f8f8f2",
      "#a09bbb",
      "#44475a",
      "#44475a",
      "#bd93f9",
    ],
  },
];
/** Readable ink on an accent fill: white on #4183c4 is only 4.00:1. */
function accentInk(hex: string) {
  const value = hex.replace("#", "");
  const channel = (index: number) => {
    const raw = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  if (value.length !== 6 || Number.isNaN(channel(0))) return "#ffffff";
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  const onWhite = 1.05 / (luminance + 0.05);
  const onInk = (luminance + 0.05) / 0.05;
  return onInk >= onWhite ? "#1b1b1b" : "#ffffff";
}
export function themeVariables(id: string, dark: boolean) {
  const theme = themePresets.find((t) => t.id === id) ?? themePresets[0];
  const colors = dark ? theme.dark : theme.light;
  return {
    ...Object.fromEntries(
      ["bg", "panel", "text", "muted", "border", "hover", "accent"].map(
        (key, i) => ["--y-" + key, colors[i]],
      ),
    ),
    "--y-accent-ink": accentInk(colors[6]),
  };
}
