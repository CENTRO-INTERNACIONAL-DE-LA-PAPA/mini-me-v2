// Sample data for parts of the design the app has no data for yet. Each value is null in a
// release build, so the UI that shows it stays hidden there and only development builds
// show the sample. Replace an entry here with real data as the feature behind it is built.

const sample = <T>(value: T): T | null => (import.meta.env.DEV ? value : null);

/** The signed-in person; Mini-Me has no user profile yet. */
export const PLACEHOLDER_USER = sample({
  name: "María Ramírez",
  firstName: "María",
  initials: "MR",
  detail: "CIP · Lima",
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
