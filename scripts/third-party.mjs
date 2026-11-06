// Writes `src-tauri/resources/third-party.json` for a release build: Mini-Me's notice and
// license, then every third-party component the app ships with its license texts, which
// Settings → About shows as "Third-party Software". Run after `npm run bundle-sidecar`, since
// the Python packages are read from the sidecar bundle. Run with `npm run third-party`.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLicenseFile,
  metadataHeaders,
  pythonPackage,
  repositoryUrl,
  shippedCrates,
  thirdParty,
} from "./third-party-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESOURCES = join(ROOT, "src-tauri", "resources");
const SIDECAR = join(RESOURCES, "sidecar");
const OUT = join(RESOURCES, "third-party.json");

// Packages whose metadata declares no license, with what their repository says.
const DECLARED = {
  "asta-agent": { license: "Apache-2.0", repository: "https://github.com/allenai/asta-plugins" },
  "asta-artifact": { license: "Apache-2.0", repository: "https://github.com/allenai/asta-plugins" },
  "asta-credits": { license: "Apache-2.0", repository: "https://github.com/allenai/asta-plugins" },
  "asta-types": { license: "Apache-2.0", repository: "https://github.com/allenai/asta-plugins" },
};

// Dev dependencies whose own files are built into the interface, though their dependencies are
// not: `src/index.css` imports `shadcn/tailwind.css`.
const BUILT_IN = ["shadcn"];

const read = (path) => readFileSync(path, "utf8");
const run = (command, args, cwd = ROOT) =>
  execFileSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** The license and notice texts directly in `folder`, and in a `licenses` folder under it. */
function licenseTexts(folder) {
  const texts = [];
  const visit = (dir, all) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name === "licenses") visit(path, true);
      } else if (all || isLicenseFile(name)) {
        texts.push(read(path).trim());
      }
    }
  };
  visit(folder, false);
  return texts;
}

/** The Rust crates of the core for this machine's platform, which releases are built on. */
function crates() {
  const host = run("rustc", ["-vV"]).match(/^host: (.+)$/m)[1];
  const args = ["metadata", "--format-version", "1", "--filter-platform", host];
  const metadata = JSON.parse(run("cargo", args, join(ROOT, "src-tauri")));
  return shippedCrates(metadata, "mini-me").map((crate) => ({
    part: "core",
    name: crate.name,
    version: crate.version,
    license: crate.license ?? (crate.license_file ? "See its license file" : null),
    repository: crate.repository ?? crate.homepage ?? null,
    texts: licenseTexts(dirname(crate.manifest_path)),
  }));
}

/** The npm packages built into the interface: production dependencies only. */
function npmPackages() {
  const listing = run("npm", ["ls", "--omit=dev", "--all", "--parseable"]);
  // The first folder is Mini-Me itself.
  const folders = listing.trim().split(/\r?\n/).slice(1);
  folders.push(...BUILT_IN.map((name) => join(ROOT, "node_modules", name)));
  const seen = new Set();
  return folders.flatMap((folder) => {
    const pkg = JSON.parse(read(join(folder, "package.json")));
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
    return [
      {
        part: "interface",
        name: pkg.name,
        version: pkg.version,
        license: license ?? null,
        repository: repositoryUrl(pkg.repository) ?? pkg.homepage ?? null,
        texts: licenseTexts(folder),
      },
    ];
  });
}

/** The Python packages in the sidecar bundle, and the Python runtime itself. */
function pythonPackages() {
  const packages = join(SIDECAR, "packages");
  const listed = readdirSync(packages)
    .filter((name) => name.endsWith(".dist-info"))
    .map((name) => {
      const folder = join(packages, name);
      const declared = pythonPackage(metadataHeaders(read(join(folder, "METADATA"))));
      const texts = licenseTexts(folder);
      return { ...declared, ...DECLARED[declared.name], part: "runtime", texts };
    })
    .filter((pkg) => pkg.name !== "mini-me-sidecar");
  const python = join(SIDECAR, "python");
  const runtime = [join(python, "LICENSE.txt"), ...pythonLibFolders(python)].find(existsSync);
  const version = run(pythonExecutable(python), ["-I", "--version"]).trim().split(" ")[1];
  listed.push({
    part: "runtime",
    name: "Python",
    version,
    license: "PSF-2.0",
    repository: "https://github.com/python/cpython",
    texts: runtime ? [read(runtime).trim()] : [],
  });
  return listed;
}

/** Where the runtime's `LICENSE.txt` is on macOS and Linux: `lib/python3.x/`. */
function pythonLibFolders(python) {
  const lib = join(python, "lib");
  if (!existsSync(lib)) return [];
  return readdirSync(lib)
    .filter((name) => /^python3\.\d+$/.test(name))
    .map((name) => join(lib, name, "LICENSE.txt"));
}

function pythonExecutable(python) {
  return process.platform === "win32" ? join(python, "python.exe") : join(python, "bin", "python3");
}

const file = thirdParty(read(join(ROOT, "NOTICE")).trim(), read(join(ROOT, "LICENSE")).trim(), [
  ...crates(),
  ...npmPackages(),
  ...pythonPackages(),
]);
writeFileSync(OUT, JSON.stringify(file));
const count = (part) => file.components.filter((c) => c.part === part).length;
console.log(
  `Wrote ${OUT}: ${count("core")} crates, ${count("interface")} npm packages, ` +
    `${count("runtime")} Python packages and runtime, ${file.texts.length} distinct texts.`,
);
