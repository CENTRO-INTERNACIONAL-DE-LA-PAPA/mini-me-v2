const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);

/** The first word of `name`. */
export function firstName(name: string): string {
  return words(name)[0] ?? "";
}

/** The first letters of the first and last words, or of the only word, uppercased. */
export function initials(name: string): string {
  const all = words(name);
  if (all.length === 0) return "";
  const letter = (word: string) => Array.from(word)[0].toUpperCase();
  return all.length === 1 ? letter(all[0]) : letter(all[0]) + letter(all[all.length - 1]);
}
