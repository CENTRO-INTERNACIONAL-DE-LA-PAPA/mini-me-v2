// Sample data for parts of the design the app has no data for yet. Each value is null in a
// release build, so the UI that shows it stays hidden there and only development builds
// show the sample. Replace an entry here with real data as the feature behind it is built.

const sample = <T>(value: T): T | null => (import.meta.env.DEV ? value : null);

/** The signed-in person; Mini-Me has no user profile yet. */
export const PLACEHOLDER_USER = sample({
  name: "John Doe",
  firstName: "John",
  initials: "JD",
  detail: "International Potato Center (CIP)",
});

/** Tasks waiting for the user across Projects, for Home's "Needs you" list. Mini-Me names
 * are looked up among the built-in Mini-Mes. */
export const PLACEHOLDER_NEEDS_YOU = sample([
  {
    title: "Approve the 2026 trial design",
    miniMe: "Investigator",
    project: "Late blight resistance",
    action: "Review",
  },
  {
    title: "Check the missing replicate for CIP 705240",
    miniMe: "Validator",
    project: "Late blight resistance",
    action: "Open",
  },
  {
    title: "Confirm the 12 sampling sites before Friday",
    miniMe: "Planner",
    project: "Seed potato virus survey",
    action: "Open",
  },
]);

/** The To-do panel's tasks: the user's own and ones Mini-Mes hand back. */
export const PLACEHOLDER_TODOS = sample([
  { title: "Check the missing replicate for CIP 705240", miniMe: "Validator", done: false },
  { title: "Approve the 2026 trial design", miniMe: "Investigator", done: false },
  { title: "Send field notes for plot 14 to Huancayo station", miniMe: null, done: false },
  { title: "Upload Huancayo 2025 data", miniMe: null, done: true },
  { title: "Shortlist candidate R-genes", miniMe: null, done: true },
]);

/** The Background jobs panel: work that runs outside a reply, now, next or on a schedule. */
export const PLACEHOLDER_JOBS = sample({
  running: [{ title: "Search and summarise", miniMe: "Researcher", step: "Read 4 papers", progress: 0.5 }],
  queued: [{ title: "Re-run replicate check with 2024 data", detail: "Starts after the current job" }],
  scheduled: [{ title: "Pull weather for Huancayo station", detail: "Mondays 06:00 · next in 5 days" }],
  recent: [
    { title: "Replicate check", detail: "10:43 · 4.2 s", failed: false },
    { title: "Translate abstracts to Spanish", detail: "Model not set", failed: true },
  ],
});
