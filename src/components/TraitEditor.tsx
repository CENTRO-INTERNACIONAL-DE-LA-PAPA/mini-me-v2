import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { LibraryView, TraitDraft, TraitSummary } from "../protocol/types";
import { copyName, NIL_ID } from "./library";
import { DeleteButton, EditorPage, Field } from "./LibraryParts";
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

  return (
    <EditorPage
      title={draft.name || "New Trait"}
      builtIn={builtIn}
      actions={actions}
      problems={problems}
      onBack={onBack}
    >
      <Field label="Name" htmlFor="trait-name" hint="An imperative verb in Title Case, like Translate">
        <Input
          id="trait-name"
          value={draft.name}
          disabled={readOnly}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>
      <Field label="Description" htmlFor="trait-description">
        <Input
          id="trait-description"
          value={draft.description}
          disabled={readOnly}
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>
      {promptBased ? (
        <>
          <Field
            label="Instructions"
            htmlFor="trait-instructions"
            hint="What the AI model is told to do with the message and the files it references"
          >
            <Textarea
              id="trait-instructions"
              className="min-h-40"
              value={draft.instructions}
              disabled={readOnly}
              onChange={(e) => update({ instructions: e.target.value })}
            />
          </Field>
          <Field label="Tools" hint="It can always read the files and tables the message references">
            <div className="grid gap-3">
              {MODEL_TOOLS.map((tool) => (
                <label key={tool.id} className="flex items-start gap-3 text-ui">
                  <Checkbox
                    checked={draft.tools.includes(tool.id)}
                    disabled={readOnly}
                    onCheckedChange={(checked) =>
                      update({
                        tools: checked
                          ? [...draft.tools, tool.id]
                          : draft.tools.filter((t) => t !== tool.id),
                      })
                    }
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{tool.label}</span>
                    <span className="text-meta text-muted-foreground">{tool.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </>
      ) : (
        <p className="text-meta text-muted-foreground">
          This Trait runs built-in code rather than instructions, so it can't be duplicated.
        </p>
      )}
      {saved && (
        <Field label="Used by">
          {users.length === 0 ? (
            <p className="text-meta text-muted-foreground">No Mini-Me runs this Trait.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {users.map((m, i) => (
                <MiniMePill key={m?.id ?? i} miniMe={m}>
                  {m?.name ?? "Mini-Me"}
                </MiniMePill>
              ))}
            </div>
          )}
        </Field>
      )}
    </EditorPage>
  );
}
