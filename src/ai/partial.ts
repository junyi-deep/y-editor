import { diffLines } from "diff";
export function patchGroups(original: string, proposed: string) {
  const groups: { before: string; after: string; changed: boolean }[] = [];
  for (const part of diffLines(original, proposed)) {
    if (!part.added && !part.removed)
      groups.push({ before: part.value, after: part.value, changed: false });
    else {
      let group = groups.at(-1);
      if (!group?.changed) {
        group = { before: "", after: "", changed: true };
        groups.push(group);
      }
      if (part.removed) group.before += part.value;
      else group.after += part.value;
    }
  }
  return groups;
}
export function selectPatch(
  original: string,
  proposed: string,
  included: number[],
) {
  return patchGroups(original, proposed)
    .map((group, index) =>
      !group.changed || included.includes(index) ? group.after : group.before,
    )
    .join("");
}
