/** Applies to document proposals, never grants shell or out-of-workspace access. */
export type ApprovalMode = "request" | "assist" | "full";
export const approvalModes = [
  {
    value: "request",
    label: "请求批准",
    description: "每次修改都先显示差异，由你批准。",
  },
  {
    value: "assist",
    label: "帮我批准",
    description: "自动应用当前文档中无冲突的修改；其他文件仍需批准。",
  },
  {
    value: "full",
    label: "完全权限",
    description: "自动应用工作区内无冲突的修改；保留工作区边界和工具权限限制。",
  },
] as const;
export function autoApprove(
  mode: ApprovalMode,
  path: string,
  documentPath: string | null | undefined,
) {
  return (
    mode === "full" || (mode === "assist" && path === (documentPath ?? ""))
  );
}
