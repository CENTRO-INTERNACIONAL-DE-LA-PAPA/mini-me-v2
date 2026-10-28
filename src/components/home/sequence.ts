/** The keys that bring the Mini-Mes to Home, in order, as `KeyboardEvent.key` values. */
export const SUMMON = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
];

/** The keys to keep after `key` is pressed following `recent`, and whether they complete
 * `sequence`. Only as many keys as the sequence has are kept. */
export function pressKey(
  recent: string[],
  key: string,
  sequence: string[] = SUMMON,
): { recent: string[]; matched: boolean } {
  const next = [...recent, key].slice(-sequence.length);
  const matched = next.length === sequence.length && next.every((k, i) => k === sequence[i]);
  return { recent: matched ? [] : next, matched };
}
