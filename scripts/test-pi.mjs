import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
const binary =
  process.env.PI_TEST_BINARY ||
  resolve(
    "src-tauri/binaries",
    process.platform === "win32"
      ? "pi-x86_64-pc-windows-msvc.exe"
      : "pi-aarch64-apple-darwin",
  );
for (const [protocol, bridge, failure, multimodal, proposal] of [
  ["openai-completions", false],
  ["openai-completions", false, undefined, true],
  ["anthropic-messages", false],
  ["openai-completions", true],
  ["openai-completions", false, "401"],
  ["anthropic-messages", false, "401"],
  ["openai-completions", false, "cancel"],
  ["anthropic-messages", false, "cancel"],
  ["openai-completions", false, undefined, false, true],
]) {
  test(
    `Pi RPC ${protocol}: ${failure || (proposal ? "read and propose edit" : multimodal ? "image and reasoning stream" : bridge ? "host tool round-trip" : "text stream")} and extension discovery`,
    { timeout: 30000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "y-pi-test-"));
      let requested = false;
      let requestCount = 0;
      let hostCalled = false;
      let child;
      const server = createServer(async (request, response) => {
        let body = "";
        for await (const chunk of request) body += chunk;
        const data = JSON.parse(body);
        if (multimodal)
          assert.ok(
            data.messages.some(
              (m) =>
                Array.isArray(m.content) &&
                m.content.some((c) => c.type === "image_url"),
            ),
            "image must reach provider",
          );
        requested = true;
        requestCount++;
        assert.ok(
          data.tools.some(
            (tool) => (tool.function?.name ?? tool.name) === "propose_patch",
          ),
        );
        assert.ok(
          !data.tools.some((tool) =>
            ["bash", "write", "edit"].includes(
              tool.function?.name ?? tool.name,
            ),
          ),
        );
        if (failure === "401") {
          response.writeHead(401, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              type: "error",
              error: {
                type: "authentication_error",
                message: "fixture authentication failure",
              },
            }),
          );
          return;
        }
        if (failure === "cancel") {
          setTimeout(
            () => child.stdin.write(JSON.stringify({ type: "abort" }) + "\n"),
            100,
          );
          return;
        }
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        if (proposal && requestCount <= 2) {
          if (requestCount === 2)
            assert.ok(JSON.stringify(data.messages).includes("one\\ntwo\\n"));
          const name = requestCount === 1 ? "workspace_read" : "propose_patch";
          const args =
            requestCount === 1
              ? { path: "note.md" }
              : {
                  path: "note.md",
                  original: "one\ntwo\n",
                  proposed: "ONE\ntwo\n",
                  reason: "test",
                };
          response.end(
            `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `tool-${requestCount}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`,
          );
        } else if (bridge && requestCount === 1) {
          response.end(
            `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "tool-1", type: "function", function: { name: "knowledge_search", arguments: '{"query":"contract"}' } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`,
          );
        } else if (protocol === "openai-completions") {
          for (const delta of [
            { role: "assistant", content: "" },
            ...(multimodal
              ? [{ reasoning_content: "Thinking about the image" }]
              : []),
            { content: "Hello editor" },
          ])
            response.write(
              `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
            );
          response.end(
            `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`,
          );
        } else {
          const events = [
            [
              "message_start",
              {
                type: "message_start",
                message: {
                  id: "test",
                  type: "message",
                  role: "assistant",
                  content: [],
                  model: "test",
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 1, output_tokens: 0 },
                },
              },
            ],
            [
              "content_block_start",
              {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              },
            ],
            [
              "content_block_delta",
              {
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "Hello editor" },
              },
            ],
            ["content_block_stop", { type: "content_block_stop", index: 0 }],
            [
              "message_delta",
              {
                type: "message_delta",
                delta: { stop_reason: "end_turn", stop_sequence: null },
                usage: { output_tokens: 2 },
              },
            ],
            ["message_stop", { type: "message_stop" }],
          ];
          response.end(
            events
              .map(
                ([name, data]) =>
                  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`,
              )
              .join(""),
          );
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = server.address().port;
      await writeFile(
        join(directory, "models.json"),
        JSON.stringify({
          providers: {
            "y-editor": {
              baseUrl: `http://127.0.0.1:${port}/v1`,
              api: protocol,
              apiKey: "test-only",
              models: [
                {
                  id: "test",
                  name: "test",
                  contextWindow: 128000,
                  maxTokens: 8192,
                  reasoning: !!multimodal,
                  input: multimodal ? ["text", "image"] : ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                },
              ],
            },
          },
        }),
      );
      if (proposal)
        await writeFile(join(directory, "note.md"), "\uFEFFone\r\ntwo\r\n");
      child = spawn(
        binary,
        [
          "--mode",
          "rpc",
          "--provider",
          "y-editor",
          "--model",
          "test",
          "--no-builtin-tools",
          "--no-extensions",
          "--no-skills",
          "--no-prompt-templates",
          "--no-context-files",
          "--no-approve",
          "--offline",
          "--no-session",
          "--extension",
          resolve("resources/pi-extension/y-editor.mjs"),
          "--tools",
          "workspace_read,workspace_search,propose_patch,knowledge_search",
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            PI_CODING_AGENT_DIR: directory,
            PI_PACKAGE_DIR:
              process.env.PI_TEST_RUNTIME || resolve("src-tauri/pi-runtime"),
            YEDITOR_WORKSPACE: directory,
            PI_OFFLINE: "1",
          },
        },
      );
      let stderr = "";
      let errBuffer = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        errBuffer += chunk;
        let end;
        while ((end = errBuffer.indexOf("\n")) >= 0) {
          const line = errBuffer.slice(0, end);
          errBuffer = errBuffer.slice(end + 1);
          try {
            const event = JSON.parse(line);
            if (event.type === "y_tool_request") {
              hostCalled = true;
              assert.equal(event.kind, "knowledge");
              const encoded = Buffer.from(
                JSON.stringify({
                  result: [
                    { text: "contract passed", path: "fixture.md", line: 1 },
                  ],
                }),
              ).toString("base64");
              child.stdin.write(
                JSON.stringify({
                  type: "prompt",
                  message: `/y-host-result ${event.requestId} ${encoded}`,
                }) + "\n",
              );
            }
          } catch {
            /* Pi diagnostic output */
          }
        }
      });
      let output = "";
      const events = [];
      try {
        const completed = new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`Pi timeout: ${stderr}\n${output}`)),
            20000,
          );
          child.on("error", reject);
          child.on("exit", (code) => {
            clearTimeout(timeout);
            reject(new Error(`Pi exited ${code}: ${stderr}`));
          });
          let buffer = "";
          child.stdout.on("data", (chunk) => {
            output += chunk;
            buffer += chunk;
            let end;
            while ((end = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, end);
              buffer = buffer.slice(end + 1);
              try {
                const event = JSON.parse(line);
                events.push(event);
                if (event.type === "y_tool_request") {
                  hostCalled = true;
                  assert.equal(event.kind, "knowledge");
                  const encoded = Buffer.from(
                    JSON.stringify({
                      result: [
                        {
                          text: "contract passed",
                          path: "fixture.md",
                          line: 1,
                        },
                      ],
                    }),
                  ).toString("base64");
                  child.stdin.write(
                    JSON.stringify({
                      type: "prompt",
                      message: `/y-host-result ${event.requestId} ${encoded}`,
                    }) + "\n",
                  );
                }
                if (event.type === "agent_end") {
                  clearTimeout(timeout);
                  resolve();
                }
              } catch {
                /* non-protocol lines recorded for diagnostics */
              }
            }
          });
        });
        child.stdin.write(
          JSON.stringify({
            type: "prompt",
            message: "Say hello",
            ...(multimodal
              ? {
                  images: [
                    {
                      type: "image",
                      mimeType: "image/png",
                      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZuoAAAAASUVORK5CYII=",
                    },
                  ],
                }
              : {}),
          }) + "\n",
        );
        await completed;
        if (multimodal)
          assert.ok(
            events.some(
              (e) => e.assistantMessageEvent?.type === "thinking_delta",
            ),
            "reasoning must reach UI stream",
          );
        if (bridge) {
          assert.ok(hostCalled, output);
          assert.equal(requestCount, 2);
          assert.ok(
            events.some((e) => e.type === "tool_execution_end" && !e.isError),
            output,
          );
        }
        if (proposal) {
          assert.equal(requestCount, 3);
          const patch = events.find(
            (event) =>
              event.type === "tool_execution_end" &&
              event.result?.details?.yEditorPatch,
          )?.result.details.yEditorPatch;
          assert.equal(patch?.path, await realpath(join(directory, "note.md")));
          assert.equal(patch?.original, "one\ntwo\n");
        }
        assert.ok(requested, `Provider was not called: ${stderr}\n${output}`);
        if (failure) {
          assert.ok(
            events.some(
              (e) =>
                e.type === "message_end" &&
                ["error", "aborted"].includes(e.message?.stopReason),
            ),
            output,
          );
        } else {
          assert.ok(
            events.some(
              (e) =>
                e.type === "message_update" &&
                e.assistantMessageEvent?.delta === "Hello editor",
            ),
            output,
          );
        }
      } finally {
        child.kill();
        // Wait for the child to actually exit before touching its directory:
        // on Windows a killed process keeps handles open for a moment, and
        // removing underneath it fails with EBUSY.
        await new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          child.once("exit", resolve);
          setTimeout(resolve, 5000).unref();
        });
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        // Retries cover the remaining Windows locks (indexer, antivirus).
        await rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    },
  );
}
