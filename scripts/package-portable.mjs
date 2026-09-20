import { cp, mkdir, writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const target = process.platform === "darwin" ? "macos-arm64" : "windows-x64";
if (!["darwin", "win32"].includes(process.platform))
  throw new Error("Portable packaging supports macOS ARM64 and Windows x64");
const output = resolve("artifacts");
await mkdir(output, { recursive: true });
const name = `y-editor-${version}-${target}-portable`;
const stagingRoot = await mkdtemp(join(tmpdir(), "y-editor-package-"));
const stage = join(stagingRoot, name);
await mkdir(stage, { recursive: true });
if (process.platform === "darwin")
  await cp(
    "src-tauri/target/release/bundle/macos/y-editor.app",
    join(stage, "y-editor.app"),
    {
      recursive: true,
      filter: (source) => !source.split(/[\\/]/).includes(".yeditor"),
    },
  );
else {
  await cp(
    "src-tauri/target/release/y-editor.exe",
    join(stage, "y-editor.exe"),
  );
  for (const name of ["rg", "pi"])
    await cp(
      `src-tauri/binaries/${name}-x86_64-pc-windows-msvc.exe`,
      join(stage, `${name}.exe`),
    );
  await cp("src-tauri/pi-runtime", join(stage, "pi-runtime"), {
    recursive: true,
  });
}
await writeFile(
  join(stage, "README.txt"),
  "y-editor portable\nSettings, sessions and API keys are stored in executable-sibling .yeditor/data.db.\nOn macOS this is y-editor.app/Contents/MacOS/.yeditor; back it up before replacing the application.\nDo not share that directory because it contains your API keys.\nmacOS package uses ad-hoc signing, not Apple notarization. Windows requires WebView2.\n",
);
const archive = join(output, `${name}.zip`);
await rm(archive, { force: true });
if (process.platform === "darwin")
  execFileSync("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    stage,
    archive,
  ]);
else execFileSync("tar", ["-a", "-cf", archive, "-C", stagingRoot, name]);
const digest = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
await writeFile(`${archive}.sha256`, `${digest}  ${name}.zip\n`);
await rm(stagingRoot, { recursive: true, force: true });
console.log(archive);
