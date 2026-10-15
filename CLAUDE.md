# Working on Mini-Me v2

Product overview, concepts and the roadmap are in `README.md`. The glossary, architecture
rules and per-artifact rules are in `openspec/config.yaml`; follow them exactly.

## Picking up work

- Run `openspec list` first. If a change is active, continue it.
- If none is active, the next change is the first row marked "Next" in the README's Roadmap.
  Confirm its scope with the user before writing any artifacts.
- Work one change at a time: propose (`/opsx:propose`), let the user review, apply
  (`/opsx:apply`), have the user verify, then finish (below).
- During planning, ask instead of assuming; the user prefers questions to guesses.

## Builds and tests

- Do not run `cargo build`, `cargo test`, `npm install`, `npm test`, `npm run build` or
  `npm run tauri dev` yourself unless the user says it is allowed on the current machine:
  antivirus software has blocked builds started by Claude. Ask the user to run them (for
  example `! cd src-tauri && cargo test`) and read the output they paste back.
- Mark a task done only after the user's run confirms it.

## Finishing a change

1. Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
2. Update the change's row in the README Roadmap to "Done" and mark the next one "Next".

## Commits

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `<type>(<optional scope>): <description>`, for example `feat(routing): ask Jev which
  Mini-Me answers` or `docs: link the first Mini-Me version`. Use the types `feat`, `fix`,
  `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style` and `chore`. Do not use `!`
  after the type; describe a breaking change in a `BREAKING CHANGE:` footer instead.
- Branch names are `<type>/<short-kebab-name>`, with the same types, for example
  `feat/routing` or `fix/sidecar-bundle`.
- Commit and PR messages carry no Claude co-author or attribution trailers.

## Code conventions

- Rust unit tests stay inline at the end of each file in `#[cfg(test)] mod tests { … }`.
  Do not move tests into separate folders or files. Frontend tests are `*.test.ts` files
  next to the code they test.
- Write and review comments with the `timeless-comments` skill.
- Keep tests minimal (Rust unit tests and frontend tests for core logic) until the user
  says the architecture is stable.
