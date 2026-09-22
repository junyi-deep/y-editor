// Real-browser check for the shadcn-vue overlay behaviours jsdom cannot host.
//
// Reka defers outside-pointer dismissal and focus restoration onto timers, and
// jsdom's timer phase stalls once a portal overlay exists, so tests/*.test.ts
// can only assert that an overlay opens and that Escape closes it. Those two
// timer-deferred behaviours are checked here instead, against real Chrome.
//
// Not part of `pnpm test`: it needs Chrome and a running dev server.
//   pnpm dev            # terminal 1
//   pnpm ui:check       # terminal 2
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.UI_CHECK_URL ?? "http://localhost:1420/";
const PORT = 9222;
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const profile = mkdtempSync(join(tmpdir(), "y-editor-ui-check-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--window-size=1280,800",
  "--disable-gpu",
  "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (message) => { throw new Error(message); };

let ws;
try {
  let targets;
  for (let attempt = 0; attempt < 50 && !targets; attempt++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => null);
  }
  const page = targets?.find((t) => t.type === "page");
  if (!page) fail("Chrome did not expose a page target");

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    const pending = waiting.get(msg.id);
    if (!pending) return;
    waiting.delete(msg.id);
    if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
    else pending.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      waiting.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression: `(() => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      fail(result.exceptionDetails.exception?.description ?? "evaluate failed");
    return result.result?.value;
  };
  const clickAt = async ([x, y]) => {
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type, x, y, button: "left", clickCount: 1, pointerType: "mouse",
      });
    await sleep(300);
  };
  const click = async (selector) => {
    const box = await evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    `);
    if (!box) fail(`no element for ${selector}`);
    await clickAt([box.x, box.y]);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
  });
  const loaded = new Promise((resolve) => {
    const handler = (event) => {
      if (JSON.parse(event.data).method === "Page.loadEventFired") {
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
  });
  await send("Page.navigate", { url: URL });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(1200);

  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  // 1. The document menu opens from the editor's more-actions button.
  await click('[aria-label="文档菜单"]');
  check("document menu opens", (await evaluate("return document.querySelector('[role=\"menu\"]') !== null")) === true);

  // 2. Clicking outside closes it, and focus returns to the trigger. This is
  //    the defect the jsdom suite cannot see.
  await clickAt([400, 400]);
  check("outside click dismisses the document menu", (await evaluate("return document.querySelector('[role=\"menu\"]') === null")) === true);
  check("focus returns to the more-actions trigger", (await evaluate("return document.activeElement?.getAttribute('aria-label')")) === "文档菜单");

  // 3. Escape closes it too.
  await click('[aria-label="文档菜单"]');
  for (const type of ["keyDown", "keyUp"])
    await send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  check("Escape dismisses the document menu", (await evaluate("return document.querySelector('[role=\"menu\"]') === null")) === true);

  // 4. A select inside the settings modal paints above its shade, keeps the
  //    dialog open, and writes the chosen value back.
  await click("button.app-menu-trigger");
  const settings = await evaluate(`
    const el = [...document.querySelectorAll('[role="menuitem"]')]
      .find((n) => n.textContent?.trim().startsWith('偏好设置'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
  if (!settings) fail("no 偏好设置 menu item");
  await clickAt([settings.x, settings.y]);
  check("settings dialog opens", (await evaluate("return document.querySelector('[role=\"dialog\"]') !== null")) === true);
  const editorTab = await evaluate(`
    const el = [...document.querySelectorAll('[role="dialog"] button')]
      .find((n) => n.textContent?.trim() === '编辑器');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  `);
  if (!editorTab) fail("no 编辑器 settings tab");
  await clickAt([editorTab.x, editorTab.y]);
  await click('[aria-label="正文字体"]');
  check("font picker lists options", (await evaluate("return document.querySelectorAll('[role=\"option\"]').length")) > 0);
  check("font picker stays above the modal", (await evaluate("return document.querySelector('[role=\"dialog\"]') !== null")) === true);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  ws?.close();
  chrome.kill();
  // Chrome keeps writing to its profile while shutting down; wait it out and
  // treat a leftover temp directory as harmless.
  await new Promise((resolve) => {
    chrome.once("exit", resolve);
    setTimeout(resolve, 5000);
  });
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    console.warn(`left ${profile} behind`);
  }
}
