import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { MINI_ME_GROUPS } from "../protocol/references";
import type { LibraryView, MiniMeDefinition, WorkflowStep } from "../protocol/types";
import { Avatar } from "./avatar/Avatar";
import { ColorPicker } from "./avatar/ColorPicker";
import { COLOR_FAMILIES, hueOf, miniMeColors } from "./avatar/palette";
import { PartTabs } from "./avatar/PartGrid";
import { copyName, NIL_ID } from "./library";
import { DeleteButton, EditorHeader, EditorPage, Field, List, Row } from "./LibraryParts";
import type { View } from "./shell/view";
import { refreshMiniMes } from "./useMiniMes";
import { StepInspector } from "./workflow/StepInspector";
import { WorkflowCanvas } from "./workflow/WorkflowCanvas";
import { traitIds } from "./workflow/workflowEdit";

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

// The design's editor tabs are taller than the shared ones, and the active one is bold.
const TAB = "h-auto py-3 data-active:font-semibold";

/** A Mini-Me's editor: `id` opens one, `from` starts a copy of one, neither a new Mini-Me.
 * It fills the main area, so the Workflow canvas can take the remaining height. */
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
  const [selected, setSelected] = useState<string | null>(null);

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
  const setSteps = (steps: WorkflowStep[]) => update({ workflow: { steps } });
  const used = traitIds(draft.workflow.steps).flatMap((t) => {
    const found = library.traits.find((x) => x.id === t);
    return found ? [found] : [];
  });

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-8 pt-6">
        <EditorHeader
          title={draft.name || "New Mini-Me"}
          icon={<Avatar {...draft.avatar} color={draft.colors} size={36} />}
          subtitle={draft.description}
          builtIn={draft.built_in}
          actions={
            draft.built_in ? (
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
            )
          }
          problems={problems}
          onBack={onBack}
        />
      </div>
      <Tabs defaultValue="workflow" className="min-h-0 flex-1 gap-0">
        <TabsList className="gap-6 px-8">
          <TabsTrigger value="workflow" className={TAB}>
            Workflow
          </TabsTrigger>
          <TabsTrigger value="traits" className={TAB}>
            Traits · {used.length}
          </TabsTrigger>
          <TabsTrigger value="appearance" className={TAB}>
            Appearance
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workflow" className="flex min-h-0">
          <div className="min-w-0 flex-1">
            <WorkflowCanvas
              steps={draft.workflow.steps}
              traits={library.traits}
              miniMe={draft}
              selectedId={selected}
              editable={!readOnly}
              onSelect={setSelected}
              onChange={setSteps}
            />
          </div>
          <StepInspector
            steps={draft.workflow.steps}
            selectedId={selected}
            traits={library.traits}
            editable={!readOnly}
            onChange={setSteps}
            onSelect={setSelected}
            onOpen={onOpen}
          />
        </TabsContent>
        <TabsContent value="traits" className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-8 py-8">
            {used.length === 0 ? (
              <p className="text-ui text-muted-foreground">
                Its Workflow runs no Traits yet. Add Trait steps on the Workflow tab.
              </p>
            ) : (
              <List>
                {used.map((t) => (
                  <Row
                    key={t.id}
                    name={t.name}
                    description={t.description}
                    builtIn={t.built_in}
                    onOpen={() => onOpen({ kind: "trait", id: t.id })}
                  />
                ))}
              </List>
            )}
          </div>
        </TabsContent>
        <TabsContent value="appearance" className="min-h-0 overflow-y-auto">
          <div className="mx-auto grid max-w-[760px] gap-6 px-8 py-8">
            <Appearance draft={draft} readOnly={readOnly} onChange={update} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Appearance({
  draft,
  readOnly,
  onChange,
}: {
  draft: MiniMeDefinition;
  readOnly: boolean;
  onChange: (change: Partial<MiniMeDefinition>) => void;
}) {
  const hue = hueOf(draft.colors);
  return (
    <>
      <Field label="Name" htmlFor="mini-me-name">
        <Input
          id="mini-me-name"
          value={draft.name}
          disabled={readOnly}
          onChange={(e) => onChange({ name: e.target.value })}
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
          onChange={(e) => onChange({ description: e.target.value })}
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
              onClick={() => onChange({ group })}
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
                onChange={(color) => onChange({ colors: miniMeColors(color) })}
              />
            </div>
            <PartTabs
              style={draft.avatar}
              color={draft.colors}
              onChange={({ base, face, accessory }) =>
                onChange({ avatar: { base, face, ...(accessory ? { accessory } : {}) } })
              }
            />
          </div>
        </Field>
      )}
    </>
  );
}
