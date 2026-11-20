import { cn } from "@/lib/utils";
import { LabelledField } from "../shell/LabelledField";
import { ConfirmButton } from "../shell/Confirm";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../api";
import type { MiniMe, TraitDraft, TraitSummary } from "../../protocol/types";
import { traitIcon } from "../../lib/traitIcons";
import { NIL_ID } from "./library";
import { EDITOR_BODY, EditorHeader, EditorPage } from "./LibraryParts";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { SheetSection } from "../shell/Sheet";
import type { View } from "../shell/view";
import { TraitIconPicker } from "./TraitIconPicker";
import { useDefinitionDraft } from "./useDefinitionDraft";

const EMPTY: TraitDraft = { id: NIL_ID, name: "", description: "", icon: null, instructions: "" };

const draftOf = (t: TraitSummary): TraitDraft => ({
  id: t.id,
  name: t.name,
  description: t.description,
  icon: t.icon,
  instructions: t.instructions ?? "",
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
  const { library, draft, setDraft, problems, save, remove } = useDefinitionDraft({
    id,
    from,
    open: (id, library) => {
      const found = library.traits.find((t) => t.id === id);
      if (!found) throw new Error("This Trait no longer exists.");
      return draftOf(found);
    },
    source: (from, library) => {
      const found = library.traits.find((t) => t.id === from);
      return found && draftOf(found);
    },
    names: (library) => library.traits.map((t) => t.name),
    empty: EMPTY,
    save: api.saveTrait,
    remove: api.deleteTrait,
    onSaved: (id) => onOpen({ kind: "trait", id }),
    onRemoved: onBack,
  });

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
  const HeaderIcon = traitIcon(draft.icon);

  const actions = builtIn ? (
    promptBased && (
      <Button variant="secondary" onClick={() => onOpen({ kind: "trait", from: draft.id })}>
        Duplicate
      </Button>
    )
  ) : (
    <>
      {saved && !library.unreadable && (
        <ConfirmButton
                    trigger={<Button variant="outline" />}
                    question={`Delete ${draft.name}? This can't be undone.`}
                    onConfirm={remove}
                  >
                    Delete
                  </ConfirmButton>
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
        icon={
          readOnly ? (
            <HeaderIcon className="size-6" />
          ) : (
            <TraitIconPicker icon={draft.icon} onPick={(icon) => update({ icon })} />
          )
        }
        subtitle={builtIn ? "Built-in Trait" : saved ? "Your Trait" : "Not saved yet"}
        back="Traits"
        actions={actions}
        problems={problems}
        onBack={onBack}
      />
      <div
        className={cn(
          EDITOR_BODY,
          "grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5 max-lg:grid-cols-1",
        )}
      >
        <div className="grid gap-4.5">
          {!builtIn && (
            <LabelledField label="Name" htmlFor="trait-name">
              <Input
                id="trait-name"
                placeholder="An imperative verb in Title Case, like Translate"
                value={draft.name}
                disabled={readOnly}
                onChange={(e) => update({ name: e.target.value })}
              />
            </LabelledField>
          )}
          <LabelledField label="What it does" htmlFor="trait-description">
            <Input
              id="trait-description"
              value={draft.description}
              disabled={readOnly}
              onChange={(e) => update({ description: e.target.value })}
            />
          </LabelledField>
          {promptBased ? (
            <>
              <LabelledField label="Instructions" htmlFor="trait-instructions">
                <Textarea
                  id="trait-instructions"
                  className="min-h-40"
                  placeholder="What the AI model is told to do with the message and the files it references"
                  value={draft.instructions}
                  disabled={readOnly}
                  onChange={(e) => update({ instructions: e.target.value })}
                />
              </LabelledField>
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
        <Empty>
          <EmptyDescription>No Mini-Me runs this Trait yet.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="grid gap-2">
          {users.map((m, i) => (
            <MiniMeSurface
              key={m?.id ?? i}
              miniMe={m}
              render={<li />}
              className="flex items-center gap-3 px-4 py-3"
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
