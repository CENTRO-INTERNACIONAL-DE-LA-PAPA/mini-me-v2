import Matter from "matter-js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import type { MiniMe } from "../../protocol/types";
import { ACCESSORIES, FACES, baseMarkup, partUrl } from "../avatar/parts";
import { MiniMePill } from "../minime/MiniMePill";
import { isClick, type Press } from "./gesture";
import { pressKey } from "./sequence";

const { Bodies, Body, Composite, Constraint, Engine, Query, Sleeping } = Matter;

/** The avatars' size, in pixels. */
const SIZE = 64;
/** The collision circle's radius: inside the avatar, whose corners and edges are empty. */
const RADIUS = SIZE * 0.4;
/** Thick enough that a thrown Mini-Me cannot pass through in one step. */
const WALL = 200;
/** The engine's fixed step. Frames run as many steps as the time since the last frame
 * needs, so motion keeps real time whatever the display's rate or a dropped frame. */
const STEP_MS = 1000 / 60;
/** The most steps one frame runs; after a long stall the simulation slows instead of
 * spending the next frame catching up. */
const MAX_STEPS = 4;
/** Steps that bring a pile to rest when reduced motion skips the drop-in. */
const SETTLE_STEPS = 900;
/** How long a Mini-Me's name stays shown after a click. */
const NAME_MS = 3000;
/** Home content that keeps its own clicks; a press on it never grabs a Mini-Me. */
const CONTENT = "button, a, input, textarea, select, label, li, [role='button']";

/** A Mini-Me in the playground; the same Mini-Me is in it once per batch. */
interface Piece {
  miniMe: MiniMe;
  body: Matter.Body;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

/** `miniMe`'s avatar drawn once into a bitmap `size` CSS pixels wide, at `scale` device
 * pixels per CSS pixel. Every part shares one viewBox, so the layers line up when each is
 * drawn over the whole bitmap. */
async function avatarSprite(miniMe: MiniMe, size: number, scale: number) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = Math.ceil(size * scale);
  const context = sprite.getContext("2d");
  // A bitmap cannot read CSS variables, so the base's colours are written into its markup.
  const base = baseMarkup(miniMe.avatar.base)
    ?.replace(/var\(--avatar-solid[^)]*\)/g, miniMe.colors.solid)
    .replace(/var\(--avatar-ink[^)]*\)/g, miniMe.colors.ink);
  const sources = [
    base && `data:image/svg+xml;charset=utf-8,${encodeURIComponent(base)}`,
    partUrl(FACES, miniMe.avatar.face),
    partUrl(ACCESSORIES, miniMe.avatar.accessory),
  ];
  for (const source of sources) {
    if (!source || !context) continue;
    const image = await loadImage(source).catch(() => null);
    if (image) context.drawImage(image, 0, 0, sprite.width, sprite.height);
  }
  return sprite;
}

/** Every Mini-Me as an avatar with physics, drawn on one canvas that fills its parent behind
 * the parent's other content. Each avatar is drawn into a bitmap once, so a frame only copies
 * bitmaps. A batch of every Mini-Me drops in when Home opens if the "Show Mini-Mes on Home"
 * setting is on, and another joins the pile whenever the summon key sequence is pressed.
 * Presses that reach the parent outside cards, buttons and fields can grab, drag and throw a
 * Mini-Me; a click shows its name. Nothing is remembered between visits. */
export function MiniMePlayground() {
  const miniMes = useMiniMes();
  // How many batches have been asked for; 0 while no Mini-Mes are shown.
  const [batches, setBatches] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .getHomeSettings()
      .then((home) => active && home.show_mini_mes && setBatches((n) => Math.max(n, 1)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let recent: string[] = [];
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select"));
      if (typing) return;
      const result = pressKey(recent, event.key);
      recent = result.recent;
      if (result.matched) setBatches((n) => n + 1);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const [named, setNamed] = useState<Piece | null>(null);
  // The piece whose name is shown, for the frame loop to place the tag.
  const namedPiece = useRef<Piece | null>(null);
  namedPiece.current = named;
  // Places every avatar and the name tag; set while the playground runs.
  const redraw = useRef<(() => void) | null>(null);
  // Adds the batches asked for that are not in the playground yet; set while it runs.
  const fill = useRef<((batches: number) => void) | null>(null);

  // A new name tag is placed at once, even when the pile is still and no frame runs.
  useLayoutEffect(() => redraw.current?.(), [named]);

  useEffect(() => {
    if (!named) return;
    const timer = setTimeout(() => setNamed(null), NAME_MS);
    return () => clearTimeout(timer);
  }, [named]);

  const shown = batches > 0;
  useEffect(() => fill.current?.(batches), [batches]);

  const ids = miniMes.map((m) => m.id).join();
  useEffect(() => {
    const element = layer.current;
    const sheet = element?.parentElement;
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!element || !sheet || !surface || !context || miniMes.length === 0 || !shown) return;
    const scale = window.devicePixelRatio || 1;

    const engine = Engine.create({ enableSleeping: true });
    let width = element.clientWidth;
    let height = element.clientHeight;
    // The floor and side walls sit just outside the sheet. The side walls reach far above
    // it, so a thrown Mini-Me falls back inside.
    let walls: Matter.Body[] = [];
    const placeWalls = () => {
      Composite.remove(engine.world, walls);
      walls = [
        Bodies.rectangle(width / 2, height + WALL / 2, width + 2 * WALL, WALL, { isStatic: true }),
        Bodies.rectangle(-WALL / 2, 0, WALL, height * 6, { isStatic: true }),
        Bodies.rectangle(width + WALL / 2, 0, WALL, height * 6, { isStatic: true }),
      ];
      Composite.add(engine.world, walls);
    };
    placeWalls();

    const pieces: Piece[] = [];
    const sprites = new Map<string, HTMLCanvasElement>();
    const fitSurface = () => {
      surface.width = Math.ceil(width * scale);
      surface.height = Math.ceil(height * scale);
    };
    fitSurface();
    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, surface.width, surface.height);
      for (const { miniMe, body } of pieces) {
        const sprite = sprites.get(miniMe.id);
        if (!sprite) continue;
        const { x, y } = body.position;
        const cos = Math.cos(body.angle) * scale;
        const sin = Math.sin(body.angle) * scale;
        context.setTransform(cos, sin, -sin, cos, x * scale, y * scale);
        context.drawImage(sprite, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
      }
      const piece = namedPiece.current;
      if (piece && tag.current) {
        const { x, y } = piece.body.position;
        tag.current.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - SIZE / 2 - 6}px)`;
      }
    };

    // The loop runs while anything moves and stops once every Mini-Me sleeps.
    let frame = 0;
    let drag: { constraint: Matter.Constraint; start: Press; piece: Piece } | null = null;
    // Time not yet simulated, and the previous frame's timestamp (null on a loop's first frame).
    let pending = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      pending = Math.min(pending + (last === null ? STEP_MS : now - last), MAX_STEPS * STEP_MS);
      last = now;
      while (pending >= STEP_MS) {
        Engine.update(engine, STEP_MS);
        pending -= STEP_MS;
      }
      draw();
      const moving = drag || pieces.some((p) => !p.body.isSleeping);
      frame = moving ? requestAnimationFrame(tick) : 0;
      if (!moving) last = null;
    };
    const wake = () => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    };
    redraw.current = draw;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let added = 0;
    // Each batch drops from above the sheet, one Mini-Me after another, onto whatever is
    // already there.
    const addBatch = () => {
      miniMes.forEach((miniMe, i) => {
        const x = RADIUS + Math.random() * Math.max(width - 2 * RADIUS, 0);
        const y = -RADIUS - i * RADIUS * 1.5;
        const body = Bodies.circle(x, y, RADIUS, {
          restitution: 0.3,
          friction: 0.4,
          frictionAir: 0.01,
          angle: (Math.random() - 0.5) * 0.6,
        });
        pieces.push({ miniMe, body });
        Composite.add(engine.world, body);
      });
      added += 1;
    };

    // Batches wait until every avatar is drawn into its bitmap.
    let ready = false;
    let disposed = false;
    let wanted = 0;
    fill.current = (asked) => {
      wanted = asked;
      if (!ready || added >= wanted) return;
      while (added < wanted) addBatch();
      if (reduced) {
        for (let i = 0; i < SETTLE_STEPS; i++) Engine.update(engine, STEP_MS);
        draw();
      }
      wake();
    };
    fill.current(batches);
    Promise.all(
      miniMes.map(async (miniMe) => sprites.set(miniMe.id, await avatarSprite(miniMe, SIZE, scale))),
    ).then(() => {
      if (disposed) return;
      ready = true;
      fill.current?.(wanted);
    });

    const resize = new ResizeObserver(() => {
      width = element.clientWidth;
      height = element.clientHeight;
      fitSurface();
      draw();
      placeWalls();
      for (const { body } of pieces) {
        const x = Math.min(Math.max(body.position.x, RADIUS), width - RADIUS);
        if (x !== body.position.x) Body.setPosition(body, { x, y: body.position.y });
        Sleeping.set(body, false);
      }
      wake();
    });
    resize.observe(element);

    const local = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    // The Mini-Me under the pointer, unless Home content that takes clicks covers it.
    const hit = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(CONTENT)) return undefined;
      const point = local(event);
      const [body] = Query.point(
        pieces.map((p) => p.body),
        point,
      );
      const piece = body && pieces.find((p) => p.body === body);
      return piece ? { piece, point } : undefined;
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const found = hit(event);
      if (!found) return;
      event.preventDefault();
      sheet.setPointerCapture(event.pointerId);
      const { piece, point } = found;
      const { body } = piece;
      Sleeping.set(body, false);
      const constraint = Constraint.create({
        pointA: point,
        bodyB: body,
        pointB: { x: point.x - body.position.x, y: point.y - body.position.y },
        stiffness: 0.2,
        damping: 0.1,
        length: 0,
      });
      Composite.add(engine.world, constraint);
      drag = { constraint, piece, start: { ...point, at: event.timeStamp } };
      sheet.style.cursor = "grabbing";
      wake();
    };
    const move = (event: PointerEvent) => {
      if (drag) {
        drag.constraint.pointA = local(event);
        Sleeping.set(drag.piece.body, false);
        return;
      }
      sheet.style.cursor = hit(event) ? "grab" : "";
    };
    const up = (event: PointerEvent) => {
      if (!drag) return;
      const end = { ...local(event), at: event.timeStamp };
      Composite.remove(engine.world, drag.constraint);
      const { piece } = drag;
      const clicked = isClick(drag.start, end);
      drag = null;
      sheet.style.cursor = "";
      if (sheet.hasPointerCapture(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
      setNamed(clicked ? piece : null);
      wake();
    };
    const clickElsewhere = (event: PointerEvent) => {
      if (!hit(event)) setNamed(null);
    };

    sheet.addEventListener("pointerdown", down);
    sheet.addEventListener("pointerdown", clickElsewhere);
    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      sheet.removeEventListener("pointerdown", down);
      sheet.removeEventListener("pointerdown", clickElsewhere);
      sheet.removeEventListener("pointermove", move);
      sheet.removeEventListener("pointerup", up);
      sheet.removeEventListener("pointercancel", up);
      sheet.style.cursor = "";
      redraw.current = null;
      fill.current = null;
      Engine.clear(engine);
    };
    // Built once the first batch is asked for, and again only when the set of Mini-Mes
    // changes; later batches join through `fill`. `batches` is read here only at the start.
  }, [ids, shown]);

  return (
    <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {named && (
        <div ref={tag} className="absolute top-0 left-0">
          <MiniMePill miniMe={named.miniMe} size="tag">
            {named.miniMe.name}
          </MiniMePill>
        </div>
      )}
    </div>
  );
}
