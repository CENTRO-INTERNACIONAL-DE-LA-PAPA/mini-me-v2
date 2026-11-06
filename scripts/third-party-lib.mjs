// The parts of collecting the third-party software a release ships that need no files or
// commands, so they can be tested. `third-party.mjs` uses them.

/** Whether a file of a package is one of its license or notice texts. */
export function isLicenseFile(name) {
  return /^(licen[cs]e|copying|notice|authors)/i.test(name);
}

/** A package's repository as a web address: npm's `github:owner/repo`, `owner/repo` and
 * `git+https://….git` forms become `https://…`; null when there is none. */
export function repositoryUrl(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) return null;
  const shorthand = raw.match(/^(?:github:)?([\w.-]+\/[\w.-]+)$/);
  if (shorthand) return `https://github.com/${shorthand[1]}`;
  return raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
}

/** The headers of a Python package's `METADATA`, each name to its values; a header's
 * continuation lines, which start with spaces, are joined to it. */
export function metadataHeaders(text) {
  const headers = new Map();
  let last = null;
  for (const line of text.split(/\r?\n/)) {
    if (line === "") break;
    if (/^\s/.test(line) && last) {
      last.value += `\n${line.trim()}`;
      continue;
    }
    const at = line.indexOf(":");
    if (at < 1) continue;
    last = { value: line.slice(at + 1).trim() };
    const name = line.slice(0, at);
    headers.set(name, [...(headers.get(name) ?? []), last]);
  }
  return new Map([...headers].map(([name, values]) => [name, values.map((v) => v.value)]));
}

/** What a Python package declares about itself: its license, from `License-Expression`, else
 * the first line of `License` (which some packages fill with the whole text), else its license
 * classifiers; and its repository, from a source or repository `Project-URL`, else its
 * homepage. */
export function pythonPackage(headers) {
  // Older packaging tools write "UNKNOWN" for a field the package left empty.
  const first = (name) => {
    const value = headers.get(name)?.[0]?.trim();
    return value && value !== "UNKNOWN" ? value : null;
  };
  const classifiers = (headers.get("Classifier") ?? [])
    .filter((c) => c.startsWith("License ::"))
    .map((c) => c.split("::").pop().trim());
  const license =
    first("License-Expression") ??
    first("License")?.split("\n")[0].trim() ??
    (classifiers.length > 0 ? classifiers.join(" OR ") : null);
  const urls = (headers.get("Project-URL") ?? []).map((entry) => {
    const [label, url] = entry.split(/,\s*/, 2);
    return { label: label.toLowerCase(), url };
  });
  const url = (labels) => urls.find((u) => labels.includes(u.label))?.url ?? null;
  return {
    name: first("Name"),
    version: first("Version"),
    license,
    repository:
      url(["source", "source code", "repository", "code", "github"]) ??
      url(["homepage", "home"]) ??
      first("Home-page"),
  };
}

/** The crates the app ships: those reachable from `root` in `cargo metadata`'s resolved graph
 * through normal dependencies, without `root` itself. Build and dev dependencies are left out. */
export function shippedCrates(metadata, root) {
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const start = metadata.packages.find((p) => p.name === root)?.id;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    for (const dep of nodes.get(queue.shift())?.deps ?? []) {
      const normal = dep.dep_kinds.some((kind) => kind.kind === null);
      if (normal && !seen.has(dep.pkg)) {
        seen.add(dep.pkg);
        queue.push(dep.pkg);
      }
    }
  }
  seen.delete(start);
  return metadata.packages.filter((p) => seen.has(p.id));
}

/** Builds the third-party file from components given as `{ part, name, version, license,
 * repository, texts: [string] }`: each distinct text is kept once, and components refer to
 * theirs by index. Throws, naming them, when components declare no license. */
export function thirdParty(notice, license, components) {
  const missing = components.filter((c) => !c.license).map((c) => `${c.name} ${c.version}`);
  if (missing.length > 0) {
    throw new Error(`These components declare no license: ${missing.join(", ")}`);
  }
  const texts = [];
  const index = new Map();
  const listed = components
    .map((c) => ({
      ...c,
      texts: c.texts.map((text) => {
        if (!index.has(text)) {
          index.set(text, texts.length);
          texts.push(text);
        }
        return index.get(text);
      }),
    }))
    .sort((a, b) => a.part.localeCompare(b.part) || a.name.localeCompare(b.name));
  return { notice, license, texts, components: listed };
}
