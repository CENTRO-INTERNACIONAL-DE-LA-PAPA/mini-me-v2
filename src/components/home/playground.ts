import Matter from "matter-js";
import type { MiniMe } from "../../protocol/types";
import { ACCESSORIES, FACES, baseMarkup, partUrl } from "../avatar/parts";
import { surfaceStyle } from "../minime/miniMeColors";
import { isClick, type Press } from "./gesture";

const { Bodies, Body, Composite, Constraint, Engine, Events, Query, Runner } = Matter;

/** The avatars' size, in pixels. */
const SIZE = 64;
/** The collision circle's radius: inside the avatar, whose corners and edges are empty. */
const RADIUS = SIZE * 0.4;
/** Thick enough that a thrown Mini-Me cannot pass through in one step. */
const WALL = 200;
/** How many of each Mini-Me `spawnAll` drops; raise it to stress-test the playground. */
const COPIES = 1;
/** How long a Mini-Me's name stays shown after a click. */
const NAME_MS = 3000;
/** Content that keeps its own clicks; a press on it never grabs a Mini-Me. */
const CONTENT = "button, a, input, textarea, select, label, li, [role='button']";

interface Piece {
  miniMe: MiniMe;
  body: Matter.Body;
  element: HTMLElement;
}

/** `miniMe`'s avatar as plain elements, layered as the `Avatar` component layers them. */
function avatar(miniMe: MiniMe): HTMLElement {
  const element = document.createElement("div");
  element.className = "absolute top-0 left-0";
  element.style.width = element.style.height = `${SIZE}px`;
  element.style.setProperty("--avatar-solid", miniMe.colors.solid);
  element.style.setProperty("--avatar-ink", miniMe.colors.ink);
  const base = document.createElement("div");
  base.className = "absolute inset-0";
  // The markup is one of the bundled base SVGs, never user input.
  base.innerHTML = baseMarkup(miniMe.avatar.base) ?? "";
  element.append(base);
  const { face, accessory } = miniMe.avatar;
  const layers = [partUrl(FACES, face), partUrl(ACCESSORIES, accessory)];
  for (const url of layers) {
    if (!url) continue;
    const image = new Image();
    image.src = url;
    image.draggable = false;
    image.className = "absolute inset-0 size-full";
    element.append(image);
  }
  return element;
}

/** A small physics game on `layer`: spawned Mini-Mes fall, pile up along the bottom and can
 * be grabbed and thrown; a click shows a Mini-Me's name. Presses reach it through `layer`'s
 * parent, outside the buttons, links and fields there. */
export function startPlayground(layer: HTMLElement) {
  const sheet = layer.parentElement ?? layer;
  const engine = Engine.create();
  const runner = Runner.create();
  const pieces: Piece[] = [];
  let running = false;
  let stopped = false;

  // The floor and side walls sit just outside the layer; the sides reach far above it, so a
  // thrown Mini-Me falls back in.
  let walls: Matter.Body[] = [];
  const placeWalls = () => {
    const { clientWidth: width, clientHeight: height } = layer;
    Composite.remove(engine.world, walls);
    walls = [
      Bodies.rectangle(width / 2, height + WALL / 2, width + 2 * WALL, WALL, { isStatic: true }),
      Bodies.rectangle(-WALL / 2, 0, WALL, height * 6, { isStatic: true }),
      Bodies.rectangle(width + WALL / 2, 0, WALL, height * 6, { isStatic: true }),
    ];
    Composite.add(engine.world, walls);
    // A narrower layer would leave Mini-Mes inside the new right wall.
    for (const { body } of pieces) {
      const x = Math.min(Math.max(body.position.x, RADIUS), width - RADIUS);
      Body.setPosition(body, { x, y: body.position.y });
    }
  };
  placeWalls();
  const resize = new ResizeObserver(placeWalls);
  resize.observe(layer);

  // The name of the last clicked Mini-Me, in its colours, above it.
  const tag = document.createElement("span");
  tag.className =
    "absolute top-0 left-0 hidden rounded-full bg-tint px-3 py-1 text-control font-medium " +
    "whitespace-nowrap text-mm-ink";
  layer.append(tag);
  let named: Piece | null = null;
  let nameTimer = 0;
  const showName = (piece: Piece | null) => {
    window.clearTimeout(nameTimer);
    named = piece;
    tag.classList.toggle("hidden", !piece);
    if (!piece) return;
    tag.textContent = piece.miniMe.name;
    for (const [name, value] of Object.entries(surfaceStyle(piece.miniMe.colors) ?? {})) {
      tag.style.setProperty(name, String(value));
    }
    nameTimer = window.setTimeout(() => showName(null), NAME_MS);
  };

  Events.on(engine, "afterUpdate", () => {
    for (const { body, element } of pieces) {
      const { x, y } = body.position;
      const at = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px)`;
      element.style.transform = `${at} rotate(${body.angle}rad)`;
    }
    if (named) {
      const { x, y } = named.body.position;
      tag.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - SIZE / 2 - 6}px)`;
    }
  });

  /** Adds `miniMe` with its centre at `x`, `y`, in pixels from the layer's top left. */
  const spawn = (miniMe: MiniMe, x: number, y: number) => {
    if (stopped) return;
    const element = avatar(miniMe);
    layer.insertBefore(element, tag);
    const body = Bodies.circle(x, y, RADIUS, {
      restitution: 0.3,
      friction: 0.4,
      frictionAir: 0.01,
      angle: (Math.random() - 0.5) * 0.6,
    });
    Composite.add(engine.world, body);
    pieces.push({ miniMe, body, element });
    if (!running) Runner.run(runner, engine);
    running = true;
  };

  /** Drops `COPIES` of each of `miniMes` from above the layer, at random places across it,
   * one above another. */
  const spawnAll = (miniMes: MiniMe[]) => {
    const dropped = Array.from({ length: COPIES }, () => miniMes).flat();
    dropped.forEach((miniMe, i) => {
      const x = RADIUS + Math.random() * Math.max(layer.clientWidth - 2 * RADIUS, 0);
      spawn(miniMe, x, -RADIUS - i * RADIUS * 1.5);
    });
    // With reduced motion the pile appears already settled.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 900; i++) Engine.update(engine, 1000 / 60);
    }
  };

  // Grabbing: a press on a Mini-Me pins it to the pointer until released; a short, still
  // press is a click, which shows its name.
  let drag: { piece: Piece; constraint: Matter.Constraint; start: Press } | null = null;
  const point = (event: PointerEvent) => {
    const rect = layer.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const pieceAt = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest(CONTENT)) return undefined;
    const [body] = Query.point(
      pieces.map((p) => p.body),
      point(event),
    );
    return pieces.find((p) => p.body === body);
  };
  const down = (event: PointerEvent) => {
    const piece = pieceAt(event);
    if (!piece) showName(null);
    if (!piece || event.button !== 0) return;
    event.preventDefault();
    sheet.setPointerCapture(event.pointerId);
    const at = point(event);
    const { position } = piece.body;
    const constraint = Constraint.create({
      pointA: at,
      bodyB: piece.body,
      pointB: { x: at.x - position.x, y: at.y - position.y },
      stiffness: 0.2,
      damping: 0.1,
      length: 0,
    });
    Composite.add(engine.world, constraint);
    drag = { piece, constraint, start: { ...at, at: event.timeStamp } };
    sheet.style.cursor = "grabbing";
  };
  const move = (event: PointerEvent) => {
    if (drag) drag.constraint.pointA = point(event);
    else sheet.style.cursor = pieceAt(event) ? "grab" : "";
  };
  const up = (event: PointerEvent) => {
    if (!drag) return;
    Composite.remove(engine.world, drag.constraint);
    const clicked = isClick(drag.start, { ...point(event), at: event.timeStamp });
    showName(clicked ? drag.piece : null);
    drag = null;
    sheet.style.cursor = "";
  };
  sheet.addEventListener("pointerdown", down);
  sheet.addEventListener("pointermove", move);
  sheet.addEventListener("pointerup", up);
  sheet.addEventListener("pointercancel", up);

  /** Ends the game and removes everything it added. */
  const stop = () => {
    stopped = true;
    Runner.stop(runner);
    Engine.clear(engine);
    resize.disconnect();
    window.clearTimeout(nameTimer);
    sheet.removeEventListener("pointerdown", down);
    sheet.removeEventListener("pointermove", move);
    sheet.removeEventListener("pointerup", up);
    sheet.removeEventListener("pointercancel", up);
    sheet.style.cursor = "";
    layer.replaceChildren();
  };

  return { spawn, spawnAll, stop };
}
