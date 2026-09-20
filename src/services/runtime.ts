import { invoke, isTauri } from "@tauri-apps/api/core";

export interface RuntimeInfo {
  name: string;
  version: string;
  platform: string;
}
export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  if (!isTauri())
    return { name: "y-editor", version: "开发预览", platform: "browser" };
  return invoke<RuntimeInfo>("app_info");
}
