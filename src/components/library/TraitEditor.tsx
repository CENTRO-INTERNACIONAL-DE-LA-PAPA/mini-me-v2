import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PuzzleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import type { LibraryView, MiniMe, TraitDraft, TraitSummary } from "../../protocol/types";
import { copyName, NIL_ID } from "./library";
import { DeleteButton, EditorHeader, EditorPage, Field } from "./LibraryParts";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { SheetSection } from "../shell/Sheet";
import type { View } from "../shell/view";

/** The tools a user-made Trait's model may be offered, besides the read tools. */
const MODEL_TOOLS = [
  { id: "save_file", label: "Save files", hint: "Save what it writes as a file in the Project" },
  { id: "show_table", label: "Show tables", hint: "Show a table below its reply" },
  {
    id: "write_document",
    label: "Write documents",
    hint: "Write a report you can edit and export as PDF",
  },
  {
    id: "suggest_edit",
    label: "Suggest edits",
    hint: "Suggest new text for a passage when asked in a document's comment",
  },
  {
    id: "edit_document",
    label: "Edit documents",
    hint: "Suggest edits to a document you reference in a message",
  },
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
      <EditorPage title="Trait" back="Traits" actions={null} problems={problems} onBack={onBack}>
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
      <Button variant="secondary" onClick={() => onOpen({ kind: "trait", from: draft.id })}>
        Duplicate
      </Button>
    )
  ) : (
    <>
      {saved && !library.unreadable && (
        <DeleteButton question={`Delete ${draft.name}? This can't be undone.`} onDelete={remove} />
      )}
      <Button disabled={readOnly} onClick={save}>
        Save
      </Button>
    </>
  );

  return (
    <div className="flex flex-col">
      <EditorHeader
        title={draft.name || "New Trait"}
        icon={<PuzzleIcon className="size-6" />}
        subtitle={builtIn ? "Built-in Trait" : saved ? "Your Trait" : "Not saved yet"}
        back="Traits"
        actions={actions}
        problems={problems}
        onBack={onBack}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5 pt-6 pr-7 pb-8 pl-8 max-lg:grid-cols-1">
        <div className="grid gap-[18px]">
          {!builtIn && (
            <Field label="Name" htmlFor="trait-name">
              <Input
                id="trait-name"
                placeholder="An imperative verb in Title Case, like Translate"
                value={draft.name}
                disabled={readOnly}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>
          )}
          <Field label="What it does" htmlFor="trait-description">
            <Input
              id="trait-description"
              value={draft.description}
              disabled={readOnly}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          {promptBased ? (
            <>
              <Field label="Instructions" htmlFor="trait-instructions">
                <Textarea
                  id="trait-instructions"
                  className="min-h-40"
                  placeholder="What the AI model is told to do with the message and the files it references"
                  value={draft.instructions}
                  disabled={readOnly}
                  onChange={(e) => update({ instructions: e.target.value })}
                />
              </Field>
              <Field label="Tools">
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
              </Field>
            </>
          ) : (
            <p className="text-meta text-muted-foreground">
              This Trait runs built-in code rather than instructions, so it can't be duplicated.
            </p>
          )}
        </div>
        {saved && <UsedBy users={users} builtIn={builtIn} />}
      </div>
    </div>
  );
}

/** The Mini-Mes that run a Trait, each in its own colour, so the reach of an edit is plain
 * before saving. */
function UsedBy({ users, builtIn }: { users: (MiniMe | undefined)[]; builtIn: boolean }) {
  return (
    <SheetSection title="Used by" meta={users.length > 0 ? users.length : undefined}>
      {users.length === 0 ? (
        <p className="text-ui text-muted-foreground">No Mini-Me runs this Trait yet.</p>
      ) : (
        <ul className="grid gap-2">
          {users.map((m, i) => (
            <MiniMeSurface
              key={m?.id ?? i}
              miniMe={m}
              render={<li />}
              className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
            >
              <MiniMeAvatar miniMe={m} size={32} />
              <span className="grid min-w-0">
                <span className="truncate font-medium text-foreground">{m?.name ?? "Mini-Me"}</span>
                {!builtIn && (
                  <span className="text-meta text-mm-ink">
                    Saving changes this Mini-Me too
                  </span>
                )}
              </span>
            </MiniMeSurface>
          ))}
        </ul>
      )}
    </SheetSection>
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
