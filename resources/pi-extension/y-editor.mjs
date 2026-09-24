import { Type } from "typebox";
import { realpath, readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";

export default function (pi) {
  const root = process.env.YEDITOR_WORKSPACE;
  const repositories = JSON.parse(process.env.YEDITOR_REPOSITORIES || "[]");
  const pending = new Map();
  let sequence = 0;
  pi.registerCommand("y-host-result", {
    description: "Internal host tool response",
    handler: async (args) => {
      const [id, encoded] = args.trim().split(" ");
      const entry = pending.get(id);
      if (!entry) return;
      try {
        const payload = JSON.parse(
          Buffer.from(encoded, "base64").toString("utf8"),
        );
        payload.error
          ? entry.reject(new Error(payload.error))
          : entry.resolve(payload.result);
      } catch (error) {
        entry.reject(error);
      }
    },
  });
  function host(params, signal) {
    return new Promise((resolve, reject) => {
      const requestId = String(++sequence);
      const finish = (callback, value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        pending.delete(requestId);
        callback(value);
      };
      const abort = () => finish(reject, new Error("Aborted"));
      const timer = setTimeout(
        () => finish(reject, new Error("Host tool timed out")),
        40000,
      );
      pending.set(requestId, {
        resolve: (value) => finish(resolve, value),
        reject: (error) => finish(reject, error),
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) return abort();
      process.stdout.write(
        JSON.stringify({ type: "y_tool_request", requestId, ...params }) + "\n",
      );
    });
  }
  for (const [name, description, parameters, kind] of [
    [
      "knowledge_search",
      "Search enabled local knowledge sources with source paths and line numbers.",
      Type.Object({ query: Type.String() }),
      "knowledge",
    ],
    [
      "mcp_list_tools",
      "List tools on a user-enabled MCP server. Use its server ID from the system context.",
      Type.Object({ server: Type.String() }),
      "mcp_list",
    ],
    [
      "mcp_call_tool",
      "Call a tool on a user-enabled MCP server. Only use after discovering its schema; respect user intent for external side effects.",
      Type.Object({
        server: Type.String(),
        tool: Type.String(),
        arguments: Type.Record(Type.String(), Type.Unknown()),
      }),
      "mcp_call",
    ],
  ])
    pi.registerTool({
      name,
      label: name,
      description,
      parameters,
      async execute(_id, args, signal) {
        return result(JSON.stringify(await host({ kind, ...args }, signal)));
      },
    });
  async function allowed(path, writing = false) {
    const roots = writing
      ? [root].filter(Boolean)
      : [root, ...repositories].filter(Boolean);
    for (const directory of roots) {
      const base = await realpath(directory);
      let full;
      try {
        full = await realpath(resolve(base, path));
      } catch {
        continue;
      }
      const rel = relative(base, full);
      if (
        rel !== ".." &&
        !rel.startsWith("../") &&
        !rel.startsWith("..\\") &&
        !isAbsolute(rel)
      )
        return full;
    }
    throw new Error("Path outside enabled roots");
  }
  const result = (text, details = {}) => ({
    content: [{ type: "text", text }],
    details,
  });
  pi.registerTool({
    name: "workspace_read",
    label: "Read workspace",
    description:
      "Read a UTF-8 file inside the selected workspace. The current unsaved document is provided in the user context; prefer that snapshot for the current file.",
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, { path }) {
      const full = await allowed(path);
      if ((await stat(full)).size > 2_000_000)
        throw new Error("File too large");
      const content = await readFile(full, "utf8");
      return result(
        /\.(md|markdown|mdown|txt)$/i.test(full)
          ? content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
          : content,
      );
    },
  });
  pi.registerTool({
    name: "workspace_search",
    label: "Search workspace",
    description:
      "Search text in Markdown and code files in the workspace, returning at most 50 matching lines.",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_id, { query }, signal) {
      const hits = [];
      let visited = 0;
      async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (signal?.aborted) throw new Error("Aborted");
          if (++visited > 10000 || hits.length >= 50) return;
          if (
            entry.isSymbolicLink() ||
            entry.name.startsWith(".") ||
            ["node_modules", "target", "dist"].includes(entry.name)
          )
            continue;
          const path = await allowed(join(dir, entry.name));
          if (entry.isDirectory()) await walk(path);
          else if (
            /\.(md|txt|rs|ts|js|vue|py|json|toml|yaml|yml)$/.test(entry.name) &&
            (await stat(path)).size < 500000
          ) {
            const text = await readFile(path, "utf8");
            text.split("\n").forEach((line, index) => {
              if (
                hits.length < 50 &&
                line.toLowerCase().includes(query.toLowerCase())
              )
                hits.push(
                  `${root ? relative(root, path) : path}:${index + 1}: ${line.slice(0, 500)}`,
                );
            });
          }
        }
      }
      for (const directory of [root, ...repositories].filter(Boolean))
        await walk(await allowed(directory));
      return result(hits.join("\n") || "No matches");
    },
  });
  pi.registerTool({
    name: "propose_patch",
    label: "Propose Markdown edit",
    description:
      'Propose an edit for user review. Never writes files. Provide exact original text from the current snapshot or workspace_read and its complete replacement. Use path "" for an untitled document.',
    parameters: Type.Object({
      path: Type.String(),
      original: Type.String(),
      proposed: Type.String(),
      reason: Type.String(),
    }),
    async execute(_id, patch) {
      let path = patch.path;
      if (patch.path) {
        path = await allowed(patch.path, true);
        if (!/\.(md|markdown|mdown|txt)$/i.test(patch.path))
          throw new Error("Only Markdown/text changes may be proposed");
      }
      return result(
        "Proposed edit queued for user review. No file was changed.",
        { yEditorPatch: { ...patch, path } },
      );
    },
  });
}
