import { useEffect, useRef } from "react";
import { api } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import { startPlayground } from "./playground";
import { pressKey } from "./sequence";

/** The Mini-Me playground (`playground.ts`) behind Home's content. Every Mini-Me drops in
 * when Home opens if the "Show Mini-Mes on Home" setting is on, and again whenever the summon
 * key sequence is pressed. Nothing is remembered between visits. */
export function MiniMePlayground() {
  const miniMes = useMiniMes();
  const layer = useRef<HTMLDivElement>(null);

  const ids = miniMes.map((m) => m.id).join();
  useEffect(() => {
    if (!layer.current || miniMes.length === 0) return;
    const game = startPlayground(layer.current);
    api
      .getHomeSettings()
      .then((home) => home.show_mini_mes && game.spawnAll(miniMes))
      .catch(() => {});

    let recent: string[] = [];
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select"));
      if (typing) return;
      const result = pressKey(recent, event.key);
      recent = result.recent;
      if (result.matched) game.spawnAll(miniMes);
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      game.stop();
    };
  }, [ids]);

  return (
    <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
  );
}
