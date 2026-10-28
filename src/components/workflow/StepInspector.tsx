import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { MiniMe, TraitSummary, WorkflowBranch, WorkflowStep } from "../../protocol/types";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { ToolSheet } from "../shell/Sheet";
import type { View } from "../shell/view";
import { toolLabel } from "./tools";
import {
  allIds,
  asksBeforeRunning,
  findStep,
  removeStep,
  setAskBeforeRunning,
  updateStep,
} from "./workflowEdit";

const TYPE_NAMES: Record<WorkflowStep["type"], string> = {
  trait: "Trait step",
  approval: "Approval",
  condition: "Condition",
  loop: "Loop",
  parallel: "Parallel",
};

/** The panel beside the canvas that edits the selected Step, or shows it read-only. */
export function StepInspector({
  steps,
  selectedId,
  traits,
  editable,
  onChange,
  onSelect,
  onOpen,
  miniMe,
}: {
  /** The Mini-Me being edited, whose colours the Trait card takes. */
  miniMe?: MiniMe;
  steps: WorkflowStep[];
  selectedId: string | null;
  traits: TraitSummary[];
  editable: boolean;
  onChange: (steps: WorkflowStep[]) => void;
  onSelect: (id: string | null) => void;
  onOpen: (view: View) => void;
}) {
  const step = selectedId ? findStep(steps, selectedId) : null;
  if (!step) return null;
  const change = (next: WorkflowStep) => onChange(updateStep(steps, step.id, () => next));
  const remaining = removeStep(steps, step.id);
  const trait = step.type === "trait" ? traits.find((t) => t.id === step.trait) : undefined;

  return (
    <ToolSheet
      title={
        step.type === "trait"
          ? (trait?.name ?? "Unknown Trait")
          : (step.label ?? TYPE_NAMES[step.type])
      }
      meta={TYPE_NAMES[step.type]}
      onClose={() => onSelect(null)}
      className="w-[340px]"
    >
      <div className="grid gap-[18px]">
        {step.type === "trait" && (
          <>
            <Row label="Trait">
              <Select
                value={step.trait}
                disabled={!editable}
                onValueChange={(id) => id && change({ ...step, trait: id as string })}
              >
                <SelectTrigger aria-label="Trait" className="w-full">
                  <SelectValue>
                    {(id: string) => traits.find((t) => t.id === id)?.name ?? "Unknown Trait"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {traits.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            {trait && (
              <MiniMeSurface miniMe={miniMe} className="grid gap-2.5 rounded-2xl p-3.5">
                <p className="text-ui leading-normal text-foreground">{trait.description}</p>
                <div className="flex items-center justify-between text-meta">
                  <span className="text-mm-ink">
                    Used by {trait.used_by.length} Mini-Me{trait.used_by.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="link"
                    className="text-meta font-semibold"
                    onClick={() => onOpen({ kind: "trait", id: trait.id })}
                  >
                    Edit Trait →
                  </Button>
                </div>
              </MiniMeSurface>
            )}
            {trait && (
              <Row label="Tools">
                <p className="text-ui text-ink-2">
                  {trait.tools.length === 0 ? "None" : trait.tools.map(toolLabel).join(" · ")}
                </p>
              </Row>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-0.5">
                <Label htmlFor="ask-before" className="font-medium">
                  Ask before running
                </Label>
                <p className="text-meta text-muted-foreground">Adds an approval before this Step.</p>
              </div>
              <Switch
                id="ask-before"
                checked={asksBeforeRunning(steps, step.id, trait?.name ?? "this Step")}
                disabled={!editable}
                onCheckedChange={(on) =>
                  onChange(setAskBeforeRunning(steps, step.id, on, trait?.name ?? "this Step"))
                }
              />
            </div>
          </>
        )}
        {step.type === "approval" && (
          <Row label="What you are asked">
            <Textarea
              value={step.prompt}
              disabled={!editable}
              onChange={(e) => change({ ...step, prompt: e.target.value })}
            />
          </Row>
        )}
        {(step.type === "condition" || step.type === "loop") && (
          <Row
            label={step.type === "loop" ? "Repeat while" : "Question"}
            hint="The AI model answers it from the outputs so far."
          >
            <Textarea
              value={step.question}
              disabled={!editable}
              onChange={(e) => change({ ...step, question: e.target.value })}
            />
          </Row>
        )}
        {step.type === "loop" && (
          <Row label="At most" hint="From 1 to 10 times.">
            <LimitInput
              value={step.max_iterations}
              disabled={!editable}
              onChange={(max_iterations) => change({ ...step, max_iterations })}
            />
          </Row>
        )}
        {(step.type === "condition" || step.type === "parallel") && (
          <Branches
            branches={step.branches}
            editable={editable}
            onChange={(branches) => change({ ...step, branches })}
          />
        )}
        {editable && (
          <Button
            variant="outline"
            className="w-fit text-destructive"
            disabled={!remaining}
            title={remaining ? undefined : "A Workflow keeps at least one Step"}
            onClick={() => {
              if (!remaining) return;
              onChange(remaining);
              onSelect(null);
            }}
          >
            Remove step
          </Button>
        )}
      </div>
    </ToolSheet>
  );
}

/** A loop's limit. The field can hold anything while typed; only a whole number from 1 to 10
 * is kept, and leaving the field shows the kept value again. */
function LimitInput({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Input
      type="number"
      min={1}
      max={10}
      className="w-24"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (Number.isInteger(n) && n >= 1 && n <= 10) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** A condition's or parallel split's branches: renamed, added, and removed down to two. A
 * branch with Steps asks once more before it goes, with its Steps. */
function Branches({
  branches,
  editable,
  onChange,
}: {
  branches: WorkflowBranch[];
  editable: boolean;
  onChange: (branches: WorkflowBranch[]) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const nextLabel = () => {
    let n = branches.length + 1;
    while (branches.some((b) => b.label === `Branch ${n}`)) n++;
    return `Branch ${n}`;
  };
  return (
    <Row label="Branches">
      <div className="grid gap-2">
        {branches.map((branch, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              aria-label={`Branch ${i + 1} label`}
              value={branch.label}
              disabled={!editable}
              onChange={(e) =>
                onChange(branches.map((b, j) => (j === i ? { ...b, label: e.target.value } : b)))
              }
            />
            {editable && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove branch"
                title={branches.length <= 2 ? "Keeps at least two branches" : undefined}
                disabled={branches.length <= 2}
                onClick={() =>
                  branch.steps.length > 0
                    ? setConfirming(i)
                    : onChange(branches.filter((_, j) => j !== i))
                }
              >
                <XIcon />
              </Button>
            )}
          </div>
        ))}
        {confirming !== null && branches[confirming] && (
          <div className="grid gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-meta">
            <span>
              Remove "{branches[confirming].label}" and its {stepCount(branches[confirming].steps)}?
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                Keep
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onChange(branches.filter((_, j) => j !== confirming));
                  setConfirming(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => onChange([...branches, { label: nextLabel(), steps: [] }])}
          >
            <PlusIcon />
            Add branch
          </Button>
        )}
      </div>
    </Row>
  );
}

/** "1 Step" or "n Steps", counting nested Steps. */
function stepCount(steps: WorkflowStep[]): string {
  const n = allIds(steps).length;
  return n === 1 ? "1 Step" : `${n} Steps`;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-[7px]">
      <span className="text-meta font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <p className="text-meta text-muted-foreground">{hint}</p>}
    </div>
  );
}
