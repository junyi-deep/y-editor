import {
  readFile,
  mkdir,
  writeFile,
  mkdtemp,
  readdir,
  copyFile,
  chmod,
  rm,
  cp,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import process from "node:process";
const target =
  process.argv[2] ||
  execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/host: (.+)/)[1];
const manifest = JSON.parse(
  await readFile(new URL("./sidecars.json", import.meta.url), "utf8"),
);
if (!manifest[target]) throw new Error(`Unsupported target: ${target}`);
const output = resolve("src-tauri/binaries");
await mkdir(output, { recursive: true });
async function find(dir, name) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === name) return join(dir, name);
    if (entry.isDirectory()) {
      const found = await find(join(dir, entry.name), name);
      if (found) return found;
    }
  }
}
for (const [name, asset] of Object.entries(manifest[target])) {
  const ext = target.includes("windows") ? ".exe" : "";
  const destination = join(output, `${name}-${target}${ext}`);
  const stamp = `${destination}.sha256`;
  try {
    if (
      (await readFile(stamp, "utf8")) === asset.sha256 &&
      (await readFile(destination)).length > 0
    ) {
      if (name === "pi")
        await access(resolve("src-tauri/pi-runtime/theme/dark.json"));
      continue;
    }
  } catch {
    /* fetch absent binaries */
  }
  console.log(`Fetching ${name} ${asset.version} (${target})`);
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw new Error("Sidecar checksum mismatch");
  const temp = await mkdtemp(join(tmpdir(), "y-sidecar-"));
  try {
    const archive = join(temp, asset.url.split("/").pop());
    await writeFile(archive, bytes);
    execFileSync("tar", ["-xf", archive, "-C", temp]);
    const binary = await find(temp, name + ext);
    if (!binary) throw new Error(`${name} missing in release archive`);
    if (name === "pi") {
      const runtime = resolve("src-tauri/pi-runtime");
      await mkdir(runtime, { recursive: true });
      for (const entry of await readdir(dirname(binary))) {
        if (entry !== name + ext)
          await cp(join(dirname(binary), entry), join(runtime, entry), {
            recursive: true,
          });
      }
    }
    await copyFile(binary, destination);
    await chmod(destination, 0o755);
    await writeFile(stamp, asset.sha256);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
