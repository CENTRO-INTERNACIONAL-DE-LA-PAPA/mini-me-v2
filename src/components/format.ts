export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

// Counted in calendar days rather than 24 hours, so a day that changes the clock for
// daylight saving still has one "Yesterday".
const dayBefore = (time: number) => {
  const date = new Date(time);
  date.setDate(date.getDate() - 1);
  return startOfDay(date.getTime());
};

/** A past moment as the sidebar and cards show it: "Just now", "5 min ago", "2 h ago",
 * "Yesterday", "Mar 12", or "Mar 12, 2024" in an earlier year. Times are in milliseconds. */
export function formatRelative(time: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (startOfDay(time) === startOfDay(now)) return `${Math.floor(minutes / 60)} h ago`;
  if (startOfDay(time) === dayBefore(now)) return "Yesterday";
  const date = new Date(time);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

/** The time of day a message was sent, such as "10:42". */
export function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
