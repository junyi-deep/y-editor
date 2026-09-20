import { it, expect, vi } from "vitest";
import { inflateRawSync } from "node:zlib";
import { exportWord } from "../src/editor/exportWord";
import { call } from "../src/services/backend";
vi.mock("../src/services/backend", () => ({ call: vi.fn(async () => true) }));
function zipXml(bytes: Buffer, name: string) {
  for (let i = 0; i + 46 < bytes.length; i++) {
    if (bytes.readUInt32LE(i) !== 0x02014b50) continue;
    const n = bytes.readUInt16LE(i + 28),
      extra = bytes.readUInt16LE(i + 30),
      comment = bytes.readUInt16LE(i + 32);
    if (bytes.subarray(i + 46, i + 46 + n).toString() === name) {
      const length = bytes.readUInt32LE(i + 20),
        method = bytes.readUInt16LE(i + 10),
        offset = bytes.readUInt32LE(i + 42);
      const start =
        offset +
        30 +
        bytes.readUInt16LE(offset + 26) +
        bytes.readUInt16LE(offset + 28);
      const data = bytes.subarray(start, start + length);
      return (method === 8 ? inflateRawSync(data) : data).toString();
    }
    i += 45 + n + extra + comment;
  }
  throw new Error("Missing Word XML");
}
it("exports an actual DOCX containing headings, emphasis, lists and table cells", async () => {
  await exportWord(
    "<h1>标题</h1><p><strong>重点</strong> and <em>emphasis</em></p><ul><li>Item</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>one</td><td>two</td></tr></table>",
    "fixture",
  );
  const args = vi.mocked(call).mock.calls.at(-1)![1]!;
  expect(args.format).toBe("docx");
  const xml = zipXml(
    Buffer.from(args.content as string, "base64"),
    "word/document.xml",
  );
  expect(xml).toContain("Heading1");
  expect(xml).toContain("标题");
  expect(xml).toContain("重点");
  expect(xml).toContain("<w:b/>");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("two");
});
