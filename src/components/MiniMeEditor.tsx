import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownIcon, ArrowUpIcon, LockIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api";
import { MINI_ME_GROUPS } from "../protocol/references";
import type {
  LibraryView,
  MiniMeDefinition,
  TraitSummary,
  WorkflowStep,
} from "../protocol/types";
import { Avatar } from "./avatar/Avatar";
import { ColorPicker } from "./avatar/ColorPicker";
import { COLOR_FAMILIES, hueOf, miniMeColors } from "./avatar/palette";
import { PartTabs } from "./avatar/PartGrid";
import { copyName, isListWorkflow, nextStepId, NIL_ID } from "./library";
import { DeleteButton, EditorPage, Field } from "./LibraryParts";
import type { View } from "./shell/view";
import { refreshMiniMes } from "./useMiniMes";

const yellow = COLOR_FAMILIES.find((f) => f.name === "Yellow")!;

const EMPTY: MiniMeDefinition = {
  id: NIL_ID,
  name: "",
  description: "",
  colors: miniMeColors(yellow),
  avatar: { base: "classic", face: "cheerful" },
  group: "thinking",
  built_in: false,
  workflow: { steps: [] },
};

/** A Mini-Me's editor: `id` opens one, `from` starts a copy of one, neither a new Mini-Me. */
export function MiniMeEditor({
  id,
  from,
  onOpen,
  onBack,
}: {
  id?: string;
  from?: string;
  onOpen: (view: View) => void;
  onBack: () => void;
}) {
  const [library, setLibrary] = useState<LibraryView | null>(null);
  const [draft, setDraft] = useState<MiniMeDefinition | null>(null);
  const [problems, setProblems] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await api.listLibrary();
        setLibrary(loaded);
        if (id) {
          setDraft(await api.getMiniMe(id));
        } else if (from) {
          const source = await api.getMiniMe(from);
          const taken = loaded.mini_mes.map((m) => m.name);
          setDraft({ ...source, id: NIL_ID, name: copyName(source.name, taken), built_in: false });
        } else {
          setDraft(EMPTY);
        }
      } catch (e) {
        setProblems(errorMessage(e));
      }
    })();
  }, [id, from]);

  if (!library || !draft) {
    return problems ? (
      <EditorPage
        title="Mini-Me"
        builtIn={false}
        actions={null}
        problems={problems}
        onBack={onBack}
      >
        {null}
      </EditorPage>
    ) : null;
  }

  const readOnly = draft.built_in || !!library.unreadable;
  const update = (change: Partial<MiniMeDefinition>) => setDraft({ ...draft, ...change });
  const hue = hueOf(draft.colors);

  async function save() {
    try {
      const result = await api.saveMiniMe(draft!);
      setProblems(null);
      setLibrary(result.library);
      refreshMiniMes();
      onOpen({ kind: "mini-me", id: result.id });
    } catch (e) {
      setProblems(errorMessage(e));
    }
  }

  async function remove() {
    try {
      await api.deleteMiniMe(draft!.id);
      refreshMiniMes();
      onBack();
    } catch (e) {
      setProblems(errorMessage(e));
    }
  }

  const actions = draft.built_in ? (
    <Button variant="outline" onClick={() => onOpen({ kind: "mini-me", from: draft.id })}>
      Duplicate
    </Button>
  ) : (
    <>
      {id && !library.unreadable && <DeleteButton onDelete={remove} />}
      <Button disabled={readOnly} onClick={save}>
        Save
      </Button>
    </>
  );

  return (
    <EditorPage
      title={draft.name || "New Mini-Me"}
      icon={<Avatar {...draft.avatar} color={draft.colors} size={36} />}
      builtIn={draft.built_in}
      actions={actions}
      problems={problems}
      onBack={onBack}
    >
      <Field label="Name" htmlFor="mini-me-name">
        <Input
          id="mini-me-name"
          value={draft.name}
          disabled={readOnly}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>
      <Field
        label="Description"
        htmlFor="mini-me-description"
        hint="What it does; Mini-Me reads this to choose who answers a message"
      >
        <Textarea
          id="mini-me-description"
          value={draft.description}
          disabled={readOnly}
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>
      <Field label="Group" hint="The heading it is listed under when you type @">
        <div className="flex gap-2">
          {MINI_ME_GROUPS.map(({ group, label }) => (
            <Button
              key={group}
              variant="outline"
              aria-pressed={draft.group === group}
              disabled={readOnly}
              onClick={() => update({ group })}
            >
              {label}
            </Button>
          ))}
        </div>
      </Field>
      {!readOnly && (
        <Field label="Look">
          <div className="grid grid-cols-[200px_1fr] items-start gap-8">
            <div className="grid gap-5">
              <div className="grid place-items-center rounded-xl border border-border bg-card p-4">
                <Avatar {...draft.avatar} color={draft.colors} size={150} />
              </div>
              <ColorPicker
                value={{ hue: hue ?? yellow.hue, solid: draft.colors.solid, ink: draft.colors.ink }}
                onChange={(color) => update({ colors: miniMeColors(color) })}
              />
            </div>
            <PartTabs
              style={draft.avatar}
              color={draft.colors}
              onChange={({ base, face, accessory }) =>
                update({ avatar: { base, face, ...(accessory ? { accessory } : {}) } })
              }
            />
          </div>
        </Field>
      )}
      <Field label="Workflow" hint="The Traits it runs to answer, in order">
        {isListWorkflow(draft.workflow.steps) ? (
          <StepList
            steps={draft.workflow.steps}
            traits={library.traits}
            readOnly={readOnly}
            onChange={(steps) => update({ workflow: { steps } })}
          />
        ) : (
          <LockedWorkflow steps={draft.workflow.steps} traits={library.traits} />
        )}
      </Field>
    </EditorPage>
  );
}

const traitName = (traits: TraitSummary[], id: string) =>
  traits.find((t) => t.id === id)?.name ?? "Unknown Trait";

/** A Workflow of Trait Steps as an ordered list to add to, remove from and reorder. */
function StepList({
  steps,
  traits,
  readOnly,
  onChange,
}: {
  steps: WorkflowStep[];
  traits: TraitSummary[];
  readOnly: boolean;
  onChange: (steps: WorkflowStep[]) => void;
}) {
  const move = (from: number, to: number) => {
    const next = [...steps];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  };
  const add = (t: TraitSummary) => {
    const id = nextStepId(
      t.name,
      steps.map((s) => s.id),
    );
    onChange([...steps, { id, type: "trait", trait: t.id }]);
  };
  return (
    <div className="grid gap-3">
      {steps.length > 0 && (
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {steps.map((step, i) => (
            <li key={step.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 text-meta text-muted-foreground">{i + 1}</span>
              <span className="flex-1 text-ui font-medium">
                {step.type === "trait" && traitName(traits, step.trait)}
              </span>
              {!readOnly && (
                <span className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move down"
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    title={steps.length === 1 ? "A Workflow keeps at least one Step" : undefined}
                    disabled={steps.length === 1}
                    onClick={() => onChange(steps.filter((_, j) => j !== i))}
                  >
                    <XIcon />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="w-fit" />}>
            <PlusIcon />
            Add Trait
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 w-64 overflow-y-auto">
            {traits.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => add(t)}>
                {t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** A Workflow with control Steps, shown nested as it runs; it can't be edited here. */
function LockedWorkflow({ steps, traits }: { steps: WorkflowStep[]; traits: TraitSummary[] }) {
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
        <LockIcon className="size-3.5" />
        This Workflow has approvals, conditions, loops or parallel branches, so it can't be edited
        as a list.
      </p>
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <StepTree steps={steps} traits={traits} />
      </div>
    </div>
  );
}

function StepTree({ steps, traits }: { steps: WorkflowStep[]; traits: TraitSummary[] }) {
  return (
    <ol className="grid gap-1.5 text-ui">
      {steps.map((step) => (
        <li key={step.id}>
          <StepLine step={step} traits={traits} />
          {step.type === "loop" && (
            <Nested>
              <StepTree steps={step.steps} traits={traits} />
            </Nested>
          )}
          {(step.type === "condition" || step.type === "parallel") &&
            step.branches.map((branch) => (
              <Nested key={branch.label}>
                <p className="mb-1 text-meta text-muted-foreground">{branch.label}</p>
                <StepTree steps={branch.steps} traits={traits} />
              </Nested>
            ))}
        </li>
      ))}
    </ol>
  );
}

function StepLine({ step, traits }: { step: WorkflowStep; traits: TraitSummary[] }) {
  switch (step.type) {
    case "trait":
      return <span className="font-medium">{traitName(traits, step.trait)}</span>;
    case "approval":
      return <span>Ask you: {step.prompt}</span>;
    case "condition":
      return <span>Decide: {step.question}</span>;
    case "loop":
      return (
        <span>
          Repeat up to {step.max_iterations} times while: {step.question}
        </span>
      );
    case "parallel":
      return <span>{step.label ?? "In parallel"}</span>;
  }
}

function Nested({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 ml-[9px] border-l-2 border-border pl-[19px]">{children}</div>;
}
