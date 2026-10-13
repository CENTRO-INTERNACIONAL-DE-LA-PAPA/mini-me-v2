---
name: timeless-comments
description: "Rules for writing code comments that stay true and useful to a future reader who never saw the conversation that produced the code. Use whenever writing comments or docstrings — which means any time you add or change code. Also use when asked to clean up, audit, or rewrite comments. Applies only to comments you write; existing comments are flagged, never edited, unless the user asks."
---

# Timeless comments

A comment is written for a stranger who opens this file a year from now. They see only the code as it is today. They never saw the previous version, the chat, the ticket, or the debugging session. Every comment must make sense to that reader.

## The test

Before writing a comment, ask: **"Would this still be true and useful if the git history and our conversation were deleted?"**

If the comment only makes sense to someone who knows what the code *used to* look like, or what was *discussed*, it is not timeless. Rewrite it or delete it.

## Never write

These describe the *change*, not the *code*. They belong in commit messages and PR descriptions, not in source.

| Pattern | Example |
|---|---|
| History of the code | `// Changed from forEach to map`, `# Previously this used a dict` |
| Reference to the conversation | `// As discussed, ...`, `# Per your request`, `// Fixed the bug you mentioned` |
| Edit markers | `// NEW`, `// UPDATED`, `# Added this`, `// <-- fix here` |
| Removed code notes | `// Removed the old validation`, `# No longer needed: X` |
| Justifying a change to the reviewer | `// Now uses the cache so it's faster` |
| Narrating the obvious | `i += 1  # increment i`, `// return the result` |
| Vague hedges | `// some magic here`, `# not sure why this works` |

## Do write

Comments that explain what the code itself cannot say:

- **Purpose** — what a non-obvious class or function is for, in one line.
- **Why, not what** — the reason behind a non-obvious choice, stated as a present-tense fact about the system: a constraint, an invariant, an external quirk.
- **Contracts** — inputs, outputs, units, side effects, error behaviour, thread-safety, when it isn't obvious from names and types.
- **Warnings** — things that will break if someone "simplifies" the code.
- **Pointers** — to a spec, RFC, issue tracker, or upstream bug, when the reason lives elsewhere and is stable.

## Rewriting change-notes into timeless comments

The useful information inside a change-note is usually a *reason*. Keep the reason, drop the history.

| Not timeless | Timeless |
|---|---|
| `// Changed to use UTC because of the timezone bug` | `// Timestamps are stored in UTC; conversion to local time happens only in the UI layer.` |
| `# Added retry since the API was flaky` | `# The upstream API intermittently returns 503; retry up to 3 times with backoff.` |
| `// Switched from Array to Set for performance` | `// Set gives O(1) membership checks; this runs once per incoming event.` |
| `# Removed the null check, it's handled upstream now` | *(delete — the absence of a check needs no comment; if it's surprising, write:)* `# `user` is guaranteed non-null by AuthMiddleware.` |
| `// Fixed: was off by one` | *(delete, or if the boundary is subtle:)* `// `end` is exclusive.` |
| `// As we discussed, keep this sync` | `// Must stay synchronous: callers rely on the value being set before the next line.` |

## Concise

- One line is the default. Use more only when the reader genuinely needs it.
- Don't restate the function name, parameter names, or types.
- Don't document every function. Well-named code with obvious behaviour needs no comment.
- Prefer improving a name over adding a comment that explains a bad name.

## No divider or banner comments

Don't write comments whose job is to visually split a file into sections:

```js
// ------------------------------------------------------------ helpers
// ==================== Python ====================
/******************** API ********************/
```

Don't restructure code to avoid needing one either; that is outside the scope of comments. If you find existing dividers, or feel a file needs one, report it to the user (`path:line` and what the sections are) and let them decide what to do.

## Scope: only the comments you write

These rules apply to comments on lines you add or change as part of the requested task. Never edit, rewrite, or delete any other existing comment on your own initiative, even one that breaks these rules or sits right next to your change.

- Don't add change-notes next to lines you modified. The diff already records the change.
- If your change makes an existing comment false, or you notice change-notes elsewhere, leave them as they are and list them in your reply (`path:line` and why), so the user can decide.
- Rewrite or remove existing comments only when the user asks for it (for example, "clean up the comments in this file").

## Where the history *does* go

When the reasoning behind a change matters, put it in the commit message or PR description. If you are asked to explain what changed, explain it in your reply to the user — not in the code.

## Final check

Before finishing any edit, scan the comments you wrote and remove any that:

1. mention a previous state of the code,
2. refer to the user, the conversation, or "the fix",
3. merely restate what the next line does,
4. are dividers or banners used only to split code into sections.
