import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { MINI_ME_GROUPS } from "../../protocol/references";
import type { LibraryView, MiniMeDefinition, MiniMeGroup, WorkflowStep } from "../../protocol/types";
import { Avatar } from "../avatar/Avatar";
import { ColorPicker } from "../avatar/ColorPicker";
import { COLOR_FAMILIES, hueOf, miniMeColors } from "../avatar/palette";
import { PartTabs } from "../avatar/PartGrid";
import { copyName, NIL_ID } from "./library";
import {
  DeleteButton,
  EditorHeader,
  EditorPage,
  Field,
  List,
  OriginBadge,
  Row,
  TraitIcon,
} from "./LibraryParts";
import { MainSheet } from "../shell/Sheet";
import type { View } from "../shell/view";
import { refreshMiniMes } from "../../hooks/useMiniMes";
import { StepInspector } from "../workflow/StepInspector";
import { WorkflowCanvas } from "../workflow/WorkflowCanvas";
import { traitIds } from "../workflow/workflowEdit";

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
  const [tab, setTab] = useState("workflow");

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
      <MainSheet>
        <EditorPage
          title="Mini-Me"
          back="Mini-Mes"
          actions={null}
          problems={problems}
          onBack={onBack}
        >
          {null}
        </EditorPage>
      </MainSheet>
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
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as string)}
      className="min-h-0 min-w-0 flex-1 flex-row gap-3"
    >
      <MainSheet>
        <EditorHeader
          title={draft.name || "New Mini-Me"}
          icon={<Avatar {...draft.avatar} color={draft.colors} size={48} />}
          subtitle={draft.description}
          back="Mini-Mes"
          tabs={
            <TabsList aria-label="Editor">
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="traits">
                Traits <span className="tabular-nums">{used.length}</span>
              </TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
            </TabsList>
          }
          actions={
            draft.built_in ? (
              <Button variant="secondary" onClick={() => onOpen({ kind: "mini-me", from: draft.id })}>
                Duplicate
              </Button>
            ) : (
              <>
                {id && !library.unreadable && (
                  <DeleteButton
                    question={`Delete ${draft.name}? This can't be undone.`}
                    onDelete={remove}
                  />
                )}
                <Button disabled={readOnly} onClick={save}>
                  Save
                </Button>
              </>
            )
          }
          problems={problems}
          onBack={onBack}
        />
        <TabsContent value="workflow" className="flex min-h-0 flex-col pt-5 pr-5 pb-5 pl-8">
          <WorkflowCanvas
            steps={draft.workflow.steps}
            traits={library.traits}
            miniMe={draft}
            selectedId={selected}
            editable={!readOnly}
            onSelect={setSelected}
            onChange={setSteps}
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
                    icon={<TraitIcon />}
                    name={t.name}
                    description={t.description}
                    details={<OriginBadge builtIn={t.built_in} />}
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
      </MainSheet>
      {/* The selected Step's inspector opens as a tool sheet beside the board. */}
      {tab === "workflow" && (
        <StepInspector
          miniMe={draft}
          steps={draft.workflow.steps}
          selectedId={selected}
          traits={library.traits}
          editable={!readOnly}
          onChange={setSteps}
          onSelect={setSelected}
          onOpen={onOpen}
        />
      )}
    </Tabs>
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
        <ToggleGroup
          aria-label="Group"
          variant="switch"
          size="switch"
          spacing={1}
          disabled={readOnly}
          value={[draft.group]}
          onValueChange={(value) => value.length > 0 && onChange({ group: value[0] as MiniMeGroup })}
        >
          {MINI_ME_GROUPS.map(({ group, label }) => (
            <ToggleGroupItem key={group} value={group}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {!readOnly && (
        <Field label="Look">
          <div className="grid grid-cols-[200px_1fr] items-start gap-8">
            <div className="grid gap-5">
              <Card className="items-center p-4">
                <Avatar {...draft.avatar} color={draft.colors} size={150} />
              </Card>
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
