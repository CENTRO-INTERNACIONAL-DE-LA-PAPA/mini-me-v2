import type { ComponentType } from "react";
import type { MessageStatus } from "../../protocol/types";
import * as approval from "./approval";
import * as paperSources from "./paper-sources";
import * as table from "./table";
import * as theories from "./theories";

/** What a renderer gets. `data` comes from the adapter of a built-in Trait that lists the
 * kind, or from the core for kinds it creates; renderers still treat optional fields as
 * possibly missing. The other props say where the component is, for kinds that take an
 * answer; renderers of other kinds ignore them. */
export interface RendererProps {
  data: unknown;
  /** The user's answer; null until answered. */
  answer?: unknown;
  projectId?: string;
  messageId?: string;
  componentId?: string;
  replyStatus?: MessageStatus;
}

/** Draws one version of a kind. */
export type Renderer = ComponentType<RendererProps>;

/** What a kind's file exports: a renderer for each version its adapter has produced. Older
 * versions stay, so stored replies still render. */
export type Renderers = Record<number, Renderer>;

/** Every kind this app can draw. A new kind is one file next to this one and one line here. */
export const catalogue = new Map<string, Renderers>([
  ["paper-sources", paperSources.renderers],
  ["theories", theories.renderers],
  ["table", table.renderers],
  ["approval", approval.renderers],
]);

/** The renderer for a kind and version, or null when this version of the app has none. */
export function rendererFor(kind: string, version: number): Renderer | null {
  return catalogue.get(kind)?.[version] ?? null;
}
