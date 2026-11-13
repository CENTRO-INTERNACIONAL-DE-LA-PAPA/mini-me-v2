export interface Point {
  x: number;
  y: number;
}

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** How far the pointer must be from the avatar's centre, in avatar widths, for the full lean. */
const REACH = 3;
const CENTRE: Point = { x: 0, y: 0 };

/** Where an avatar drawn in `box` looks for `pointer`: a direction whose length, from 0 to 1, is
 * how far its features lean, each by its own amount in `index.css`. */
export function lookOffset(pointer: Point, box: Box): Point {
  const dx = pointer.x - (box.left + box.width / 2);
  const dy = pointer.y - (box.top + box.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return CENTRE;
  const lean = Math.min(distance / (box.width * REACH), 1);
  return { x: (dx / distance) * lean, y: (dy / distance) * lean };
}

/** `offset` turned by `-angle` radians, for a head inside an element rotated by `angle`. */
const unrotate = ({ x, y }: Point, angle: number): Point => ({
  x: x * Math.cos(angle) + y * Math.sin(angle),
  y: -x * Math.sin(angle) + y * Math.cos(angle),
});

const tracked = new Map<HTMLElement, () => number>();
let pointer: Point | null = null;
let frame = 0;
let listening = false;
let reducedMotion: MediaQueryList | null = null;

const setLook = (avatar: HTMLElement, { x, y }: Point) => {
  avatar.style.setProperty("--look-x", String(x));
  avatar.style.setProperty("--look-y", String(y));
};

const update = () => {
  frame = 0;
  const avatars = [...tracked];
  // Every box is read before any is written, so the layout is computed once per frame.
  const boxes = avatars.map(([avatar]) => avatar.getBoundingClientRect());
  avatars.forEach(([avatar, angle], i) => {
    setLook(avatar, pointer ? unrotate(lookOffset(pointer, boxes[i]), angle()) : CENTRE);
  });
};
const schedule = () => {
  if (!frame) frame = requestAnimationFrame(update);
};
const move = (event: PointerEvent) => {
  pointer = { x: event.clientX, y: event.clientY };
  schedule();
};
const out = (event: PointerEvent) => {
  if (event.relatedTarget) return;
  pointer = null;
  schedule();
};

const motionReduced = () => {
  if (!reducedMotion) {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.addEventListener("change", sync);
  }
  return reducedMotion.matches;
};

/** Listens to the pointer only while some avatar looks at it and motion is not reduced. */
function sync() {
  const wanted = tracked.size > 0 && !motionReduced();
  if (wanted === listening) return;
  listening = wanted;
  if (wanted) {
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerout", out);
    return;
  }
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerout", out);
  pointer = null;
  for (const avatar of tracked.keys()) setLook(avatar, CENTRE);
}

/** Makes `avatar`'s features lean toward the pointer until the returned function is called.
 * `angle` gives the avatar's own rotation in radians, for avatars that spin. */
export function trackLook(avatar: HTMLElement, angle: () => number = () => 0) {
  tracked.set(avatar, angle);
  sync();
  schedule();
  return () => {
    tracked.delete(avatar);
    sync();
  };
}
