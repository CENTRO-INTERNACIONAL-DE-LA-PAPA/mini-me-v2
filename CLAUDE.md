# Working on Mini-Me v2

Product overview and concepts are in `README.md`, and the Roadmap in `docs/roadmap.md`.
The glossary, architecture rules and per-artifact rules are in `openspec/config.yaml`;
follow them exactly.

## Picking up work

- Run `openspec list` first. If a change is active, continue it.
- If none is active, the next change is the first row marked "Next" in the Roadmap
  (`docs/roadmap.md`). Confirm its scope with the user before writing any artifacts.
- Work one change at a time: propose (`/opsx:propose`), let the user review, apply
  (`/opsx:apply`), have the user verify, then finish (below).
- During planning, ask instead of assuming; the user prefers questions to guesses.

## Builds and tests

- Do not run `cargo build`, `cargo test`, `npm install`, `npm test`, `npm run build`,
  `npm run tauri dev` or `npm run tauri:dev` yourself unless the user says it is allowed on
  the current machine: antivirus software has blocked builds started by Claude. Ask the user
  to run them (for example `! cd src-tauri && cargo test`) and read the output they paste
  back.
- Mark a task done only after the user's run confirms it.

## Finishing a change

1. Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
2. Update the change's row in the Roadmap (`docs/roadmap.md`) to "Done" and mark the next
   one "Next".
3. Ask the user, then open the change's pull request into `dev` (see below).

## Commits

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `<type>(<optional scope>): <description>`, for example `feat(routing): ask Jev which
  Mini-Me answers` or `docs: link the first Mini-Me version`. Use the types `feat`, `fix`,
  `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style` and `chore`. Do not use `!`
  after the type; describe a breaking change in a `BREAKING CHANGE:` footer instead.
- Branch names are `<type>/<short-kebab-name>`, with the same types, for example
  `feat/routing` or `fix/sidecar-bundle`.
- Commit, issue and PR messages carry no Claude co-author or attribution trailers.

## Branches and pull requests

- Ask the user before every commit, push, merge or pull request, saying what goes where,
  and wait for a yes. The rules below say where changes go, not that asking can be skipped.
- `dev` is where all work lands. Every change goes through `dev` first; nothing is pushed
  or merged to `main` by Claude. When enough has gathered on `dev`, the user merges `dev`
  into `main` and cuts a release.
- Small, non-breaking changes (documentation, comments, README and Roadmap edits, sample
  files, config that changes no behaviour) are committed and pushed directly to `dev`.
- Anything that changes logic or behaviour, and every roadmap change, is developed on its
  own branch from `dev` and reaches `dev` through a pull request into `dev`. Ask the user
  before opening a PR, and merge it only once the user has reviewed and approved it, with a
  merge commit (`gh pr merge --merge`).
- Every PR targets `dev`. The only PR into `main` is the one that merges `dev` into `main`,
  opened only when the user asks for it.
- CI (`.github/workflows/ci.yml`) runs the tests on every pull request into `dev` or
  `main`; direct pushes to `dev` are not tested.
- When unsure whether a change is small, ask.
- Issues and PRs follow the templates below. Titles follow the Conventional Commits format
  used for commits, for example `fix(ui): show why a reply failed`. GitHub pre-fills the same
  templates from `.github/ISSUE_TEMPLATE/issue.md` and `.github/pull_request_template.md`;
  keep them in step with this file.

### Issue template

```markdown
## Summary
One or two sentences: what is wrong, or what is wanted.

## Context
Why it matters, and links to the Roadmap row, OpenSpec change or related issues.

## Steps to reproduce
(Bugs only.)
1. …

**Expected:** …
**Actual:** …

## Scope
- In: …
- Out: …

## Acceptance criteria
- [ ] …
```

### Pull request template

```markdown
## Summary
What this changes and why, in one to three sentences.

Closes #… · Roadmap #… · OpenSpec change: `openspec/changes/<name>/`
(Keep only the links that apply.)

## Changes
- …

## How it was tested
- [ ] `cd src-tauri && cargo test`
- [ ] `npm test`
- [ ] `cd sidecar && uv run pytest`
- [ ] In the app: …

## Notes for review
Risks, follow-ups, decisions the reviewer should know about, screenshots.
```

## Code conventions

- Rust unit tests stay inline at the end of each file in `#[cfg(test)] mod tests { … }`.
  Do not move tests into separate folders or files. Frontend tests are `*.test.ts` files
  next to the code they test. Sidecar Python tests use pytest and live in `sidecar/tests/`
  as `test_<module>.py`; run them with `cd sidecar && uv run pytest`.
- Write and review comments with the `timeless-comments` skill.
- Put imports at the top of the file. Import inside a function or condition only for a
  reason you can name, and state it in a comment: an optional or platform-specific module,
  a package that is slow to load and that most runs never use, or an import that must run
  after something else (such as reserving stdout in the sidecar). In TypeScript the
  equivalent is a dynamic `import()`, used only to split off code that loads on demand.
- Keep tests minimal and concise (Rust unit tests, frontend tests for core logic, and
  pytest tests for the sidecar's Python tools) until the user says the architecture is
  stable.
