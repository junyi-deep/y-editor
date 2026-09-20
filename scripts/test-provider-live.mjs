// Explicit opt-in private integration test. Never prints the credential or provider body.
import process from "node:process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const specification = await readFile(
  resolve("docs/dev/开发提示词_20260918.md"),
  "utf8",
);
const key = specification.match(/sk-[A-Za-z0-9_-]{16,}/)?.[0];
if (!key) throw new Error("Private test credential not found");
const directory = await mkdtemp(join(tmpdir(), "y-editor-private-e2e-"));
let child;
try {
  await writeFile(
    join(directory, "models.json"),
    JSON.stringify({
      providers: {
        "y-editor": {
          baseUrl: "https://api.chatanywhere.tech/v1",
          api: "openai-completions",
          apiKey: "$YEDITOR_API_KEY",
          models: [
            {
              id: "deepseek-v4.1-flash",
              name: "test",
              contextWindow: 128000,
              maxTokens: 128,
              reasoning: true,
              input: ["text", "image"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
  );
  child = spawn(
    resolve("src-tauri/binaries/pi-aarch64-apple-darwin"),
    [
      "--mode",
      "rpc",
      "--provider",
      "y-editor",
      "--model",
      "deepseek-v4.1-flash",
      "--no-builtin-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--no-approve",
      "--offline",
      "--no-session",
    ],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: directory,
        PI_CODING_AGENT_DIR: directory,
        PI_PACKAGE_DIR: resolve("src-tauri/pi-runtime"),
        YEDITOR_API_KEY: key,
        PI_OFFLINE: "1",
      },
    },
  );
  let buffer = "",
    text = "",
    reasoning = false,
    usage = false,
    failed = false;
  const result = await new Promise((resolveResult, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Provider E2E timed out")),
      60000,
    );
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Pi launch failed"));
    });
    child.stderr.on("data", () => {});
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (
          e.type === "message_update" &&
          e.assistantMessageEvent?.type === "text_delta"
        )
          text += e.assistantMessageEvent.delta ?? "";
        if (e.assistantMessageEvent?.type === "thinking_delta")
          reasoning = true;
        if (e.type === "message_end") {
          usage = !!e.message?.usage;
          if (e.message?.stopReason === "error") failed = true;
        }
        if (e.type === "response" && e.success === false) failed = true;
        if (e.type === "agent_end") {
          clearTimeout(timer);
          resolveResult({
            passed: !failed && text.trim().length > 0,
            receivedText: text.length > 0,
            reasoning,
            usage,
          });
        }
      }
    });
    child.stdin.write(
      JSON.stringify({ type: "set_thinking_level", level: "off" }) + "\n",
    );
    child.stdin.write(
      JSON.stringify({
        type: "prompt",
        message: "Reply with the single word OK. This is a connectivity test.",
      }) + "\n",
    );
  });
  console.log(
    JSON.stringify({
      provider: "chatanywhere",
      model: "deepseek-v4.1-flash",
      ...result,
    }),
  );
  if (!result.passed) process.exitCode = 1;
} finally {
  child?.kill();
  await rm(directory, { recursive: true, force: true });
}
