import type { Edge, Node } from "@xyflow/react";
import type { WorkflowStep } from "../../protocol/types";
import type { ListPath, PathPart, Slot } from "./workflowEdit";

export const NODE = { width: 220, height: 56 };
export const PILL = { width: 180, height: 32 };
export const EMPTY_SLOT = { width: 160, height: 40 };
const JOIN = 8;
const GAP_Y = 44;
const GAP_X = 40;
const LOOP_PAD = 20;

export type LayoutNodeKind =
  "start" | "end" | "trait" | "approval" | "marker" | "loop" | "frame" | "join" | "slot";

export interface LayoutNodeData extends Record<string, unknown> {
  kind: LayoutNodeKind;
  /** The Step a trait, approval, marker or loop node draws. */
  step?: WorkflowStep;
  /** Where a Step dropped on an empty slot goes. */
  slot?: Slot;
}

/** A canvas node; `position` is its top-left corner, and `width` and `height` are always set. */
export type LayoutNode = Node<LayoutNodeData, LayoutNodeKind>;

export interface LayoutEdgeData extends Record<string, unknown> {
  /** Where a Step dropped on this connector goes; absent for connectors that are not a place
   * between Steps, such as the ones around an empty slot. */
  slot?: Slot;
  /** A branch's label, on the connector into that branch. */
  label?: string;
}

export type LayoutEdge = Edge<LayoutEdgeData, "connector">;

interface Size {
  width: number;
  height: number;
}

function measureList(list: WorkflowStep[]): Size {
  if (list.length === 0) return EMPTY_SLOT;
  const sizes = list.map(measureStep);
  return {
    width: Math.max(...sizes.map((s) => s.width)),
    height: sizes.reduce((sum, s) => sum + s.height, 0) + GAP_Y * (list.length - 1),
  };
}

function measureStep(step: WorkflowStep): Size {
  switch (step.type) {
    case "trait":
    case "approval":
      return NODE;
    case "condition":
    case "parallel": {
      const branches = step.branches.map((b) => measureList(b.steps));
      const width = branches.reduce((sum, b) => sum + b.width, 0) + GAP_X * (branches.length - 1);
      const tallest = Math.max(...branches.map((b) => b.height));
      return {
        width: Math.max(PILL.width, width),
        height: PILL.height + GAP_Y + tallest + GAP_Y + JOIN,
      };
    }
    case "loop": {
      const inner = measureList(step.steps);
      return {
        width: Math.max(PILL.width, inner.width) + LOOP_PAD * 2,
        height: PILL.height + GAP_Y + inner.height + GAP_Y + JOIN + LOOP_PAD,
      };
    }
  }
}

/** The nodes a placed block of Steps starts and ends at, for the connectors around it. */
interface Ends {
  entry: string;
  exit: string;
}

class Builder {
  nodes: LayoutNode[] = [];
  edges: LayoutEdge[] = [];

  node(id: string, kind: LayoutNodeKind, cx: number, top: number, size: Size, data = {}) {
    this.nodes.push({
      id,
      type: kind,
      position: { x: cx - size.width / 2, y: top },
      width: size.width,
      height: size.height,
      data: { kind, ...data },
      ...(kind === "frame" ? { zIndex: -1 } : {}),
    });
  }

  edge(source: string, target: string, data: LayoutEdgeData = {}) {
    this.edges.push({ id: `${source}->${target}`, source, target, type: "connector", data });
  }

  /** Places `list` centred on `cx` from `top`, joining its Steps by connectors that each stand
   * for the slot between them. */
  list(list: WorkflowStep[], path: ListPath, cx: number, top: number): Ends {
    if (list.length === 0) {
      const id = `slot:${JSON.stringify(path)}`;
      this.node(id, "slot", cx, top, EMPTY_SLOT, { slot: { list: path, index: 0 } });
      return { entry: id, exit: id };
    }
    let y = top;
    let first: Ends | null = null;
    let previous: Ends | null = null;
    list.forEach((step, i) => {
      const ends = this.step(step, path, i, cx, y);
      if (previous) this.edge(previous.exit, ends.entry, { slot: { list: path, index: i } });
      first ??= ends;
      previous = ends;
      y += measureStep(step).height + GAP_Y;
    });
    return { entry: first!.entry, exit: previous!.exit };
  }

  step(step: WorkflowStep, path: ListPath, index: number, cx: number, top: number): Ends {
    const size = measureStep(step);
    switch (step.type) {
      case "trait":
      case "approval":
        this.node(step.id, step.type, cx, top, NODE, { step });
        return { entry: step.id, exit: step.id };
      case "condition":
      case "parallel": {
        this.node(step.id, "marker", cx, top, PILL, { step });
        const join = `${step.id}:join`;
        const branchesTop = top + PILL.height + GAP_Y;
        const widths = step.branches.map((b) => measureList(b.steps).width);
        const total = widths.reduce((sum, w) => sum + w, 0) + GAP_X * (widths.length - 1);
        let left = cx - total / 2;
        step.branches.forEach((branch, j) => {
          const inner: ListPath = [...path, { step: index, branch: j } as PathPart];
          const ends = this.list(branch.steps, inner, left + widths[j] / 2, branchesTop);
          const empty = branch.steps.length === 0;
          this.edge(step.id, ends.entry, {
            label: branch.label,
            ...(empty ? {} : { slot: { list: inner, index: 0 } }),
          });
          this.edge(
            ends.exit,
            join,
            empty ? {} : { slot: { list: inner, index: branch.steps.length } },
          );
          left += widths[j] + GAP_X;
        });
        this.node(join, "join", cx, top + size.height - JOIN, { width: JOIN, height: JOIN });
        return { entry: step.id, exit: join };
      }
      case "loop": {
        // The frame starts at the header pill's middle, so the pill sits on its top edge.
        this.node(`${step.id}:frame`, "frame", cx, top + PILL.height / 2, {
          width: size.width,
          height: size.height - PILL.height / 2,
        });
        this.node(step.id, "loop", cx, top, PILL, { step });
        const inner: ListPath = [...path, { step: index, loop: true }];
        const ends = this.list(step.steps, inner, cx, top + PILL.height + GAP_Y);
        const join = `${step.id}:join`;
        const empty = step.steps.length === 0;
        this.edge(step.id, ends.entry, empty ? {} : { slot: { list: inner, index: 0 } });
        this.edge(
          ends.exit,
          join,
          empty ? {} : { slot: { list: inner, index: step.steps.length } },
        );
        this.node(join, "join", cx, top + size.height - LOOP_PAD - JOIN, {
          width: JOIN,
          height: JOIN,
        });
        return { entry: step.id, exit: join };
      }
    }
  }
}

/** The start and end pills' IDs. Step IDs never hold a ":", so they can't clash. */
export const START_ID = ":start";
export const END_ID = ":end";

/** The canvas for a Workflow: a "When invoked" start, its Steps from top to bottom, and a
 * "Reply in conversation" end, centred on x = 0. */
export function layoutWorkflow(steps: WorkflowStep[]): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
} {
  const b = new Builder();
  b.node(START_ID, "start", 0, 0, PILL);
  const top = PILL.height + GAP_Y;
  const ends = b.list(steps, [], 0, top);
  const bottom = top + measureList(steps).height + GAP_Y;
  b.node(END_ID, "end", 0, bottom, PILL);
  const empty = steps.length === 0;
  b.edge(START_ID, ends.entry, empty ? {} : { slot: { list: [], index: 0 } });
  b.edge(ends.exit, END_ID, empty ? {} : { slot: { list: [], index: steps.length } });
  return { nodes: b.nodes, edges: b.edges };
}
