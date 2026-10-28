const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The name of a copy of `name`: "<name> Copy", or "<name> Copy <n>" with the smallest n from 2
 * that no name in `taken` has, ignoring case. */
export function copyName(name: string, taken: string[]): string {
  const free = (candidate: string) => !taken.some((t) => same(t, candidate));
  const first = `${name} Copy`;
  if (free(first)) return first;
  let n = 2;
  while (!free(`${first} ${n}`)) n++;
  return `${first} ${n}`;
}

/** An ID for a new Step running `traitName`: the name in kebab-case, with "-<n>" from 2
 * appended when another Step has it. */
export function nextStepId(traitName: string, ids: string[]): string {
  const base =
    traitName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "step";
  if (!ids.includes(base)) return base;
  let n = 2;
  while (ids.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The ID that asks the core to create a definition instead of replacing one. */
export const NIL_ID = "00000000-0000-0000-0000-000000000000";
