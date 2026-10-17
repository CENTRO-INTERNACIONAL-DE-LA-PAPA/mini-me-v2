import type { ComponentType } from "react";
import * as paperSources from "./paper-sources";
import * as table from "./table";
import * as theories from "./theories";

/** Draws one version of a kind. `data` comes from the adapter of a built-in Trait that lists
 * the kind; renderers still treat optional fields as possibly missing. */
export type Renderer = ComponentType<{ data: unknown }>;

/** What a kind's file exports: a renderer for each version its adapter has produced. Older
 * versions stay, so stored replies still render. */
export type Renderers = Record<number, Renderer>;

/** Every kind this app can draw. A new kind is one file next to this one and one line here. */
export const catalogue = new Map<string, Renderers>([
  ["paper-sources", paperSources.renderers],
  ["theories", theories.renderers],
  ["table", table.renderers],
]);

/** The renderer for a kind and version, or null when this version of the app has none. */
export function rendererFor(kind: string, version: number): Renderer | null {
  return catalogue.get(kind)?.[version] ?? null;
}
