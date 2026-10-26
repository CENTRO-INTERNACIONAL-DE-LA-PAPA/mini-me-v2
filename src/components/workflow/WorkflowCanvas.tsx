import { cn } from "@/lib/utils";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import {
  GitForkIcon,
  HandIcon,
  PlusIcon,
  PuzzleIcon,
  RepeatIcon,
  SplitIcon,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { MiniMe, TraitSummary, WorkflowStep } from "../../protocol/types";
import { MiniMeAvatar } from "../MiniMeAvatar";
import { toolCount } from "./tools";
import { useStepDrag, type DragPayload, type DragState } from "./useStepDrag";
import {
  insertStep,
  isSlotInside,
  moveStep,
  newStep,
  type Slot,
  type StepKind,
} from "./workflowEdit";
import {
  EMPTY_SLOT,
  layoutWorkflow,
  type LayoutEdge,
  type LayoutNode,
  type LayoutNodeData,
  type LayoutEdgeData,
} from "./workflowLayout";

interface CanvasState {
  steps: WorkflowStep[];
  traits: TraitSummary[];
  miniMe: MiniMe;
  selectedId: string | null;
  editable: boolean;
  drag: DragState | null;
  start: (payload: DragPayload) => (event: ReactPointerEvent) => void;
}

const CanvasContext = createContext<CanvasState | null>(null);
const useCanvas = () => useContext(CanvasContext)!;

const PRESSABLE = new Set<LayoutNodeData["kind"]>(["trait", "approval", "marker", "loop", "slot"]);

const TOOLBAR: { kind: StepKind; label: string; icon: LucideIcon }[] = [
  { kind: "trait", label: "Trait step", icon: PuzzleIcon },
  { kind: "approval", label: "Approval", icon: HandIcon },
  { kind: "condition", label: "Condition", icon: GitForkIcon },
  { kind: "loop", label: "Loop", icon: RepeatIcon },
  { kind: "parallel", label: "Parallel", icon: SplitIcon },
];

/** A Mini-Me's Workflow on a dotted canvas, laid out from its Steps. When `editable`, Steps
 * are added from the toolbar and moved by dragging them onto connectors. */
export function WorkflowCanvas({
  steps,
  traits,
  miniMe,
  selectedId,
  editable,
  onSelect,
  onChange,
}: {
  steps: WorkflowStep[];
  /** Every Trait a Trait Step may run, without the placeholders. */
  traits: TraitSummary[];
  miniMe: MiniMe;
  selectedId: string | null;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (steps: WorkflowStep[]) => void;
}) {
  // A dropped Trait step waits here until its Trait is picked.
  const [pending, setPending] = useState<{ slot: Slot; x: number; y: number } | null>(null);
  const { nodes, edges } = useMemo(() => {
    const layout = layoutWorkflow(steps);
    // React Flow turns pointer events off on nodes it can't select or drag, as here. Steps
    // take presses and empty slots take drops, so they turn them back on.
    const nodes = layout.nodes.map((n) =>
      PRESSABLE.has(n.data.kind) ? { ...n, style: { pointerEvents: "all" as const } } : n,
    );
    return { nodes, edges: layout.edges };
  }, [steps]);

  const onDrop = useCallback(
    (payload: DragPayload, slot: Slot, point: { x: number; y: number }) => {
      if (!editable) return;
      if (payload.kind === "move") {
        const moved = moveStep(steps, payload.id, slot);
        if (moved) onChange(moved);
      } else if (payload.step === "trait") {
        setPending({ slot, ...point });
      } else {
        const step = newStep(payload.step, steps);
        onChange(insertStep(steps, slot, step));
        onSelect(step.id);
      }
    },
    [steps, editable, onChange, onSelect],
  );
  const onPress = useCallback(
    (payload: DragPayload) => payload.kind === "move" && onSelect(payload.id),
    [onSelect],
  );
  const { drag, pointer, start } = useStepDrag({ onDrop, onPress });

  // Nodes and connectors read this, so it changes only when what they draw does, not on
  // every pointer move.
  const state = useMemo(
    () => ({ steps, traits, miniMe, selectedId, editable, drag, start }),
    [steps, traits, miniMe, selectedId, editable, drag, start],
  );
  return (
    <CanvasContext.Provider value={state}>
      <div className="relative h-full w-full bg-surface-1">
        <ReactFlow<LayoutNode, LayoutEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.5}
          panOnScroll
          proOptions={{ hideAttribution: true }}
          onPaneClick={() => onSelect(null)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="var(--canvas-dot)"
          />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        {editable && <Toolbar />}
        {drag && pointer && editable && <Ghost label={drag.payload.label} at={pointer} />}
        {pending && (
          <TraitMenu
            traits={traits}
            at={pending}
            onPick={(t) => {
              const step = newStep("trait", steps, t);
              onChange(insertStep(steps, pending.slot, step));
              onSelect(step.id);
              setPending(null);
            }}
            onCancel={() => setPending(null)}
          />
        )}
      </div>
    </CanvasContext.Provider>
  );
}

function Toolbar() {
  const { start } = useCanvas();
  return (
    <div className="absolute top-4 left-5 z-10 grid gap-0.5 rounded-[10px] border border-border bg-card p-[5px]">
      {TOOLBAR.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          className="flex cursor-grab items-center gap-1.5 rounded-[7px] px-[9px] py-[5px] text-meta transition-colors duration-150 ease-out select-none hover:bg-accent active:cursor-grabbing"
          onPointerDown={start({ kind: "new", step: kind, label })}
        >
          <Icon className="size-4" strokeWidth={1.4} />
          {label}
        </button>
      ))}
    </div>
  );
}

/** What is being dragged, following the pointer. */
function Ghost({ label, at }: { label: string; at: { x: number; y: number } }) {
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-full border border-border bg-card px-3 py-1 text-meta font-medium shadow-sm"
      style={{ left: at.x + 12, top: at.y + 12 }}
    >
      {label}
    </div>
  );
}

const MENU = { width: 240, maxHeight: 288, margin: 8 };

function TraitMenu({
  traits,
  at,
  onPick,
  onCancel,
}: {
  traits: TraitSummary[];
  at: { x: number; y: number };
  onPick: (t: TraitSummary) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  // Opens at the drop point, moved in so it stays inside the window.
  const left = Math.max(MENU.margin, Math.min(at.x, window.innerWidth - MENU.width - MENU.margin));
  const top = Math.max(
    MENU.margin,
    Math.min(at.y, window.innerHeight - MENU.maxHeight - MENU.margin),
  );
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onCancel} />
      <div
        role="menu"
        aria-label="Pick the Trait this Step runs"
        className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-md"
        style={{ left, top, width: MENU.width, maxHeight: MENU.maxHeight }}
      >
        <p className="px-2 py-1.5 text-meta text-muted-foreground">
          {traits.length > 0 ? "Which Trait does it run?" : "There are no Traits to run."}
        </p>
        {traits.map((t) => (
          <button
            key={t.id}
            type="button"
            role="menuitem"
            autoFocus={t === traits[0]}
            className="block w-full rounded-md px-2 py-1.5 text-left text-ui outline-none hover:bg-accent focus-visible:bg-accent"
            onClick={() => onPick(t)}
          >
            {t.name}
          </button>
        ))}
      </div>
    </>
  );
}

/** Invisible connection points: connectors leave a node's bottom and enter its top. */
function Ends() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="opacity-0"
      />
    </>
  );
}

/** Pressing a Step selects it; when the canvas is editable, dragging it moves it. Start and
 * end pills have no Step and take no press. */
function useStepPress(step: WorkflowStep | undefined, label: string) {
  const { start } = useCanvas();
  return step
    ? { className: "nopan nodrag", onPointerDown: start({ kind: "move", id: step.id, label }) }
    : { className: undefined, onPointerDown: undefined };
}

function StepCard({
  step,
  icon: Icon,
  name,
  meta,
}: {
  step: WorkflowStep;
  icon: LucideIcon;
  name: string;
  meta: string;
}) {
  const { selectedId, editable } = useCanvas();
  const press = useStepPress(step, name);
  return (
    <div
      {...press}
      className={cn(
        press.className,
        "flex h-14 w-[220px] items-center gap-3 rounded-[10px] border border-border bg-card px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        selectedId === step.id && "border-primary ring-1 ring-primary",
      )}
    >
      <Ends />
      <span className="grid size-[30px] shrink-0 place-items-center rounded-md border border-border bg-card">
        <Icon className="size-4" strokeWidth={1.4} />
      </span>
      <span className="grid min-w-0 gap-px">
        <span className="truncate text-[14px] font-semibold">{name}</span>
        <span className="truncate text-meta text-muted-foreground">{meta}</span>
      </span>
    </div>
  );
}

function TraitNode({ data }: NodeProps<LayoutNode>) {
  const { traits } = useCanvas();
  const step = data.step as Extract<WorkflowStep, { type: "trait" }>;
  const t = traits.find((x) => x.id === step.trait);
  return (
    <StepCard
      step={step}
      icon={PuzzleIcon}
      name={t?.name ?? "Unknown Trait"}
      meta={t ? toolCount(t.tools) : ""}
    />
  );
}

function ApprovalNode({ data }: NodeProps<LayoutNode>) {
  const step = data.step as Extract<WorkflowStep, { type: "approval" }>;
  return <StepCard step={step} icon={HandIcon} name="You approve" meta={step.prompt} />;
}

function Pill({
  children,
  step,
  className,
}: {
  children: ReactNode;
  step?: WorkflowStep;
  className?: string;
}) {
  const { selectedId, editable } = useCanvas();
  const label = step ? pillText(step) : "";
  const press = useStepPress(step, label);
  return (
    <div
      {...press}
      className={cn(
        press.className,
        "flex h-8 w-[180px] items-center justify-center gap-[7px] rounded-full border border-border bg-card px-3 text-[12.5px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        step && (editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"),
        step && selectedId === step.id && "border-primary ring-1 ring-primary",
        className,
      )}
    >
      <Ends />
      {children}
    </div>
  );
}

/** A control Step's short name: its label, else its question, else what it does. */
function pillText(step: WorkflowStep): string {
  if (step.label) return step.label;
  if (step.type === "condition" && step.question) return step.question;
  if (step.type === "loop") return `Repeat up to ${step.max_iterations}×`;
  if (step.type === "parallel") return "In parallel";
  return "Decide";
}

function EndPill({ text }: { text: string }) {
  const { miniMe } = useCanvas();
  return (
    <Pill>
      <MiniMeAvatar miniMe={miniMe} size={18} />
      {text}
    </Pill>
  );
}

function MarkerNode({ data }: NodeProps<LayoutNode>) {
  const step = data.step!;
  const Icon = step.type === "parallel" ? SplitIcon : GitForkIcon;
  return (
    <Pill step={step}>
      <Icon className="size-3.5 shrink-0" strokeWidth={1.4} />
      <span className="truncate">{pillText(step)}</span>
    </Pill>
  );
}

function LoopNode({ data }: NodeProps<LayoutNode>) {
  const step = data.step!;
  return (
    <Pill step={step}>
      <RepeatIcon className="size-3.5 shrink-0" strokeWidth={1.4} />
      <span className="truncate">{pillText(step)}</span>
    </Pill>
  );
}

function FrameNode({ width, height }: NodeProps<LayoutNode>) {
  return (
    <div
      className="rounded-xl border border-dashed border-border-strong"
      style={{ width, height }}
    />
  );
}

function JoinNode() {
  return (
    <div className="size-2 rounded-full bg-connector">
      <Ends />
    </div>
  );
}

/** Where a Step can be dropped into an empty branch or loop. */
function SlotNode({ data }: NodeProps<LayoutNode>) {
  const { drag, editable, steps } = useCanvas();
  const key = JSON.stringify(data.slot);
  const blocked = drag?.payload.kind === "move" && isSlotInside(steps, drag.payload.id, data.slot!);
  return (
    <div
      data-slot={editable && !blocked ? key : undefined}
      className={cn(
        "grid place-items-center rounded-[10px] border border-dashed border-border-strong text-meta text-muted-foreground",
        drag?.over === key && "border-primary bg-card text-foreground",
      )}
      style={EMPTY_SLOT}
    >
      <Ends />
      {editable ? "Drop a Step here" : "No Steps"}
    </div>
  );
}

const NODE_TYPES = {
  start: () => <EndPill text="When invoked" />,
  end: () => <EndPill text="Reply in conversation" />,
  trait: TraitNode,
  approval: ApprovalNode,
  marker: MarkerNode,
  loop: LoopNode,
  frame: FrameNode,
  join: JoinNode,
  slot: SlotNode,
} satisfies Record<LayoutNodeData["kind"], unknown>;

/** An orthogonal connector, with its branch's label and, while dragging, a drop target. */
function ConnectorEdge(props: EdgeProps<LayoutEdge>) {
  const { drag, editable, steps } = useCanvas();
  const data: LayoutEdgeData = props.data ?? {};
  const [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: 0 });
  const key = data.slot ? JSON.stringify(data.slot) : null;
  const blocked =
    drag?.payload.kind === "move" && data.slot && isSlotInside(steps, drag.payload.id, data.slot);
  const showTarget = editable && drag && key && !blocked;
  return (
    <>
      <BaseEdge path={path} style={{ stroke: "var(--connector)", strokeWidth: 1.25 }} />
      <EdgeLabelRenderer>
        {data.label && (
          <span
            className="absolute text-[11.5px] text-muted-foreground"
            style={{
              transform: `translate(-50%, -100%) translate(${props.targetX}px, ${props.targetY - 6}px)`,
            }}
          >
            {data.label}
          </span>
        )}
        {showTarget && (
          <span
            data-slot={key}
            className={cn(
              "nopan absolute grid size-5 place-items-center rounded-full border border-border-strong bg-card text-muted-foreground",
              drag.over === key && "size-6 border-primary bg-primary text-primary-foreground",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <PlusIcon className="size-3" />
          </span>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const EDGE_TYPES = { connector: ConnectorEdge };
