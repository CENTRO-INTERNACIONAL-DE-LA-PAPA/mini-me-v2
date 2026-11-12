import type { ComponentType } from "react";
import type { MessageStatus } from "../../protocol/types";
import * as approval from "./approval";
import * as chart from "./chart";
import * as datasetResults from "./dataset-results";
import * as document from "./document";
import * as documentEdits from "./document-edits";
import * as handOff from "./hand-off";
import * as paperSources from "./paper-sources";
import * as suggestion from "./suggestion";
import * as table from "./table";
import * as theories from "./theories";

/** What a renderer gets. Any field of `data` may be missing; only kinds that take an answer
 * use the IDs and `replyStatus`. */
export interface RendererProps {
  data: unknown;
  /** The user's answer; null until answered. */
  answer?: unknown;
  projectId?: string;
  messageId?: string;
  componentId?: string;
  replyStatus?: MessageStatus;
  /** The solid colour of the Mini-Me that wrote the reply, for kinds that draw in it. */
  color?: string;
}

/** Draws one version of a kind. */
export type Renderer = ComponentType<RendererProps>;

/** A kind's renderer per data version; old versions stay so stored replies still render. */
export type Renderers = Record<number, Renderer>;

/** Every kind this app can draw. A new kind is one file next to this one and one line here. */
const catalogue = new Map<string, Renderers>([
  ["paper-sources", paperSources.renderers],
  ["theories", theories.renderers],
  ["table", table.renderers],
  ["approval", approval.renderers],
  ["chart", chart.renderers],
  ["document", document.renderers],
  ["document-edits", documentEdits.renderers],
  ["suggestion", suggestion.renderers],
  ["hand-off", handOff.renderers],
  ["dataset-results", datasetResults.renderers],
]);

/** The renderer for a kind and version, or null when this version of the app has none. */
export function rendererFor(kind: string, version: number): Renderer | null {
  return catalogue.get(kind)?.[version] ?? null;
}
