import { fuzzyScore } from "./registry";
interface Item {
  id: string;
  label: string;
  detail: string;
  command: boolean;
}
let files: Item[] = [];
self.onmessage = (
  event: MessageEvent<{ id: number; query: string; files?: Item[] }>,
) => {
  if (event.data.files) files = event.data.files;
  const { id, query } = event.data;
  const items = files
    .map((item) => ({ ...item, score: fuzzyScore(query, item.detail) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 80);
  self.postMessage({ id, items });
};
