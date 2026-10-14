// Checks that package.json, tauri.conf.json and Cargo.toml carry the same app version and,
// when a tag such as `v0.2.0` is given, that it matches the tag. Exits 1 on any mismatch.
//
//   node scripts/check-version.mjs [tag]

import { readFileSync } from "node:fs";

const repo = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), "utf8");

// The first `version` in Cargo.toml is the one in its `[package]` table.
const cargo = read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = {
  "package.json": JSON.parse(read("package.json")).version,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": cargo,
};

const tag = process.argv[2];
const expected = tag ? tag.replace(/^v/, "") : versions["package.json"];
const wrong = Object.entries(versions).filter(([, version]) => version !== expected);

if (wrong.length > 0) {
  const source = tag ? `tag ${tag}` : "package.json";
  console.error(`Version mismatch with ${source} (${expected}):`);
  for (const [file, version] of wrong) {
    console.error(`  ${file}: ${version ?? "no version found"}`);
  }
  process.exit(1);
}
console.log(`All versions are ${expected}.`);
