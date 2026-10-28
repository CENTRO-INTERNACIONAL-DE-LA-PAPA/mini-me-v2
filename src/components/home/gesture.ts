/** The farthest a press may travel, in pixels, and still count as a click. */
const CLICK_DISTANCE = 4;
/** The longest a press may last, in milliseconds, and still count as a click. */
const CLICK_DURATION = 300;

export interface Press {
  x: number;
  y: number;
  /** When the press started or ended, in milliseconds. */
  at: number;
}

/** Whether a press from `start` to `end` is a click rather than a drag. */
export function isClick(start: Press, end: Press): boolean {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return distance <= CLICK_DISTANCE && end.at - start.at <= CLICK_DURATION;
}
