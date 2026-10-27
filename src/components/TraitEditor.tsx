import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeftIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api";
import type { LibraryView, MiniMe, TraitDraft, TraitSummary } from "../protocol/types";
import { copyName, NIL_ID } from "./library";
import { DeleteButton, EditorPage, TraitIcon } from "./LibraryParts";
import { MiniMePill } from "./MiniMePill";
import type { View } from "./shell/view";

/** The tools a user-made Trait's model may be offered, besides the read tools. */
const MODEL_TOOLS = [
  { id: "save_file", label: "Save files", hint: "Save what it writes as a file in the Project" },
  { id: "show_table", label: "Show tables", hint: "Show a table below its reply" },
];

const EMPTY: TraitDraft = { id: NIL_ID, name: "", description: "", instructions: "", tools: [] };

const draftOf = (t: TraitSummary): TraitDraft => ({
  id: t.id,
  name: t.name,
  description: t.description,
  instructions: t.instructions ?? "",
  tools: t.tools,
});

/** A Trait's editor: `id` opens one, `from` starts a copy of one, neither a new Trait. */
export function TraitEditor({
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
  const [draft, setDraft] = useState<TraitDraft | null>(null);
  const [problems, setProblems] = useState<string | null>(null);

  useEffect(() => {
    api
      .listLibrary()
      .then((loaded) => {
        setLibrary(loaded);
        const find = (traitId: string) => loaded.traits.find((t) => t.id === traitId);
        const source = from ? find(from) : undefined;
        if (id) {
          const found = find(id);
          if (found) setDraft(draftOf(found));
          else setProblems("This Trait no longer exists.");
        } else if (source) {
          const taken = loaded.traits.map((t) => t.name);
          setDraft({ ...draftOf(source), id: NIL_ID, name: copyName(source.name, taken) });
        } else {
          setDraft(EMPTY);
        }
      })
      .catch((e) => setProblems(errorMessage(e)));
  }, [id, from]);

  if (!library || !draft) {
    return problems ? (
      <EditorPage title="Trait" builtIn={false} actions={null} problems={problems} onBack={onBack}>
        {null}
      </EditorPage>
    ) : null;
  }

  const saved = id ? library.traits.find((t) => t.id === id) : undefined;
  const builtIn = saved?.built_in ?? false;
  const promptBased = saved?.prompt_based ?? true;
  const readOnly = builtIn || !!library.unreadable;
  const users = (saved?.used_by ?? []).map((m) => library.mini_mes.find((x) => x.id === m));
  const update = (change: Partial<TraitDraft>) => setDraft({ ...draft, ...change });

  async function save() {
    try {
      const result = await api.saveTrait(draft!);
      setProblems(null);
      onOpen({ kind: "trait", id: result.id });
      setLibrary(result.library);
    } catch (e) {
      setProblems(errorMessage(e));
    }
  }

  async function remove() {
    try {
      await api.deleteTrait(draft!.id);
      onBack();
    } catch (e) {
      setProblems(errorMessage(e));
    }
  }

  const actions = builtIn ? (
    promptBased && (
      <Button variant="outline" onClick={() => onOpen({ kind: "trait", from: draft.id })}>
        Duplicate
      </Button>
    )
  ) : (
    <>
      {saved && !library.unreadable && <DeleteButton onDelete={remove} />}
      <Button disabled={readOnly} onClick={save}>
        Save
      </Button>
    </>
  );

  const name = draft.name || "New Trait";
  return (
    <div className="flex flex-col">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 px-8 pt-4 text-meta">
        <Button variant="link" className="gap-1 text-muted-foreground" onClick={onBack}>
          <ChevronLeftIcon className="size-4" />
          Traits
        </Button>
        <span aria-hidden className="text-off">
          /
        </span>
        <span className="truncate">{name}</span>
      </nav>
      <header className="flex items-center gap-4 border-b border-border px-8 pt-2.5 pb-5">
        <TraitIcon size={40} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="truncate text-page font-bold">{name}</h1>
          <p className="text-ui text-ink-2">
            {builtIn ? "Built-in Trait" : saved ? "Your Trait" : "Not saved yet"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">{actions}</div>
      </header>
      <div className="grid gap-5 px-8 py-6">
        {problems && (
          <ul className="grid max-h-32 gap-1 overflow-y-auto rounded-lg border border-border bg-card px-4 py-3 text-meta text-destructive">
            {problems.split("\n").map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {saved && <UsedBy users={users} builtIn={builtIn} />}
        {!builtIn && (
          <Labelled label="Name" htmlFor="trait-name">
            <Input
              id="trait-name"
              placeholder="An imperative verb in Title Case, like Translate"
              value={draft.name}
              disabled={readOnly}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Labelled>
        )}
        <Labelled label="What it does" htmlFor="trait-description">
          <Input
            id="trait-description"
            value={draft.description}
            disabled={readOnly}
            onChange={(e) => update({ description: e.target.value })}
          />
        </Labelled>
        {promptBased ? (
          <>
            <Labelled label="Instructions" htmlFor="trait-instructions">
              <Textarea
                id="trait-instructions"
                className="min-h-40"
                placeholder="What the AI model is told to do with the message and the files it references"
                value={draft.instructions}
                disabled={readOnly}
                onChange={(e) => update({ instructions: e.target.value })}
              />
            </Labelled>
            <Labelled label="Tools">
              <ul className="border-t border-border">
                <ToolRow
                  label="Read files"
                  hint="Read the files and tables the message references"
                  checked
                  disabled
                />
                {MODEL_TOOLS.map((tool) => (
                  <ToolRow
                    key={tool.id}
                    label={tool.label}
                    hint={tool.hint}
                    checked={draft.tools.includes(tool.id)}
                    disabled={readOnly}
                    onChange={(checked) =>
                      update({
                        tools: checked
                          ? [...draft.tools, tool.id]
                          : draft.tools.filter((t) => t !== tool.id),
                      })
                    }
                  />
                ))}
              </ul>
            </Labelled>
          </>
        ) : (
          <p className="text-meta text-muted-foreground">
            This Trait runs built-in code rather than instructions, so it can't be duplicated.
          </p>
        )}
      </div>
    </div>
  );
}

/** The Mini-Mes that run a Trait, so the reach of an edit is plain before saving. */
function UsedBy({ users, builtIn }: { users: (MiniMe | undefined)[]; builtIn: boolean }) {
  const reach =
    users.length === 1 ? "that Mini-Me" : users.length === 2 ? "both" : `all ${users.length}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-ui text-ink-2">
      {users.length > 0 ? (
        <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
      ) : (
        <InfoIcon aria-hidden className="size-4 shrink-0" />
      )}
      <p className="flex-1">
        {users.length === 0 ? (
          "No Mini-Me runs this Trait yet."
        ) : (
          <>
            Used by{" "}
            {users.map((m, i) => (
              <Fragment key={m?.id ?? i}>
                {i > 0 && (i === users.length - 1 ? " and " : ", ")}
                <MiniMePill miniMe={m} className="font-medium">
                  {m?.name ?? "Mini-Me"}
                </MiniMePill>
              </Fragment>
            ))}
            .{!builtIn && ` Changes apply to ${reach}.`}
          </>
        )}
      </p>
    </div>
  );
}

/** A field under a small grey label. */
function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-meta font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** A tool the Trait's model may use, ticked when it is offered. */
function ToolRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <li>
      <label className="flex items-center gap-3 border-b border-border py-2.5">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onChange} />
        <span className="grid gap-px">
          <span className="text-ui font-medium">{label}</span>
          <span className="text-meta text-muted-foreground">{hint}</span>
        </span>
      </label>
    </li>
  );
}
