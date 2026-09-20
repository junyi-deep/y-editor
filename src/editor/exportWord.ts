import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  ImageRun,
  ExternalHyperlink,
} from "docx";
import { call } from "../services/backend";
export async function exportWord(
  html: string,
  title: string,
  documentPath?: string | null,
) {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const pictures = new Map<Element, ImageRun>();
  for (const element of dom.querySelectorAll("img")) {
    try {
      let source = element.getAttribute("src") ?? "";
      if (
        !source.startsWith("data:") &&
        documentPath &&
        !/^https?:/.test(source)
      )
        source = await call<string>("image_read", {
          documentPath,
          source: decodeURIComponent(source),
        });
      if (!source.startsWith("data:image/")) continue;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = source;
      });
      const ratio = Math.min(1, 600 / img.width);
      let type: "png" | "jpg" = source.startsWith("data:image/jpeg")
        ? "jpg"
        : "png";
      if (!source.startsWith("data:image/png") && type !== "jpg") {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
        source = canvas.toDataURL("image/png");
        type = "png";
      }
      const data = Uint8Array.from(atob(source.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      pictures.set(
        element,
        new ImageRun({
          type,
          data,
          transformation: {
            width: Math.round(img.width * ratio),
            height: Math.round(img.height * ratio),
          },
        }),
      );
    } catch {
      /* Keep a readable reference for unavailable image assets. */
    }
  }
  function runs(
    node: Node,
    style: { bold?: boolean; italics?: boolean; strike?: boolean } = {},
  ): (TextRun | ImageRun | ExternalHyperlink)[] {
    if (node.nodeType === Node.TEXT_NODE)
      return [new TextRun({ text: node.textContent ?? "", ...style })];
    const el = node as Element;
    if (el.tagName === "IMG")
      return [
        pictures.get(el) ??
          new TextRun(
            `[图片: ${el.getAttribute("alt") || el.getAttribute("src") || ""}]`,
          ),
      ];
    if (el.tagName === "BR") return [new TextRun({ break: 1 })];
    if (
      el.tagName === "A" &&
      /^(https?:|mailto:)/.test(el.getAttribute("href") ?? "")
    )
      return [
        new ExternalHyperlink({
          link: el.getAttribute("href")!,
          children: [
            new TextRun({ text: el.textContent ?? "", style: "Hyperlink" }),
          ],
        }),
      ];
    return Array.from(node.childNodes).flatMap((n) =>
      runs(n, {
        ...style,
        bold: style.bold || /^(B|STRONG)$/.test(el.tagName),
        italics: style.italics || /^(I|EM)$/.test(el.tagName),
        strike: style.strike || /^(S|DEL)$/.test(el.tagName),
      }),
    );
  }
  const children = Array.from(dom.body.children).flatMap(
    (el): (Paragraph | Table)[] => {
      if (el.tagName === "TABLE")
        return [
          new Table({
            rows: Array.from((el as HTMLTableElement).rows).map(
              (row) =>
                new TableRow({
                  children: Array.from(row.cells).map(
                    (cell) =>
                      new TableCell({
                        children: [new Paragraph({ children: runs(cell) })],
                      }),
                  ),
                }),
            ),
          }),
        ];
      if (el.tagName === "UL" || el.tagName === "OL")
        return Array.from(el.children).map(
          (li, i) =>
            new Paragraph({
              children: [
                new TextRun(el.tagName === "OL" ? `${i + 1}. ` : "• "),
                ...runs(li),
              ],
            }),
        );
      const heading = /^H[1-6]$/.test(el.tagName)
        ? [
            HeadingLevel.HEADING_1,
            HeadingLevel.HEADING_2,
            HeadingLevel.HEADING_3,
            HeadingLevel.HEADING_4,
            HeadingLevel.HEADING_5,
            HeadingLevel.HEADING_6,
          ][Number(el.tagName[1]) - 1]
        : undefined;
      return [new Paragraph({ children: runs(el), heading })];
    },
  );
  const wordDocument = new Document({ title, sections: [{ children }] });
  const content = await Packer.toBase64String(wordDocument);
  await call("export_file", { format: "docx", content });
}
