import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api";
import { MINI_ME_GROUPS } from "../protocol/references";
import type { LibraryView as Library, MiniMe, TraitSummary } from "../protocol/types";
import { List, MiniMeCard, Row, TraitIcon } from "./LibraryParts";
import { MiniMeAvatar } from "./MiniMeAvatar";
import { SheetPage } from "./shell/Sheet";
import type { LibraryTab, View } from "./shell/view";

/** A group's heading as the `@` list shows it, or the group itself for one it doesn't know. */
const groupLabel = (group: string) => MINI_ME_GROUPS.find((g) => g.group === group)?.label ?? group;

/** Every Mini-Me or Trait, user-made ones first, then built-in ones; each entry opens its editor.
 * Both lists can be searched by name and description, and Mini-Mes narrowed to one group. */
export function LibraryView({ tab, onOpen }: { tab: LibraryTab; onOpen: (view: View) => void }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .listLibrary()
      .then(setLibrary)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const traits = tab === "traits";

  return (
    <SheetPage
      title={traits ? "Traits" : "Mini-Mes"}
      description={
        traits
          ? "A Trait is one Step a Mini-Me can run. Editing a Trait changes every Mini-Me that uses it."
          : "Mini-Mes answer in your Conversations by running the Traits in their Workflow. Built-in ones can be duplicated; your own can be edited and deleted."
      }
      actions={
        <>
          <Tabs
            value={tab}
            onValueChange={(id) => onOpen({ kind: "library", tab: id as LibraryTab })}
          >
            <TabsList aria-label="Library">
              <TabsTrigger value="mini-mes">
                Mini-Mes
                {library && <span className="tabular-nums">{library.mini_mes.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="traits">
                Traits
                {library && <span className="tabular-nums">{library.traits.length}</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {library && (
            <Button
              disabled={!!library.unreadable}
              onClick={() => onOpen(traits ? { kind: "trait" } : { kind: "mini-me" })}
            >
              <PlusIcon />
              {traits ? "New Trait" : "New Mini-Me"}
            </Button>
          )}
        </>
      }
    >
      {error && <p className="text-meta text-destructive">{error}</p>}
      {library && <Problems library={library} />}
      {library && (
        <>
          <div className="flex items-center justify-between gap-4">
            {!traits && <GroupFilter library={library} group={group} onSelect={setGroup} />}
            <div className="relative ml-auto w-60 shrink-0">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label={traits ? "Search Traits" : "Search Mini-Mes"}
                placeholder="Search"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {traits ? (
            <TraitLists library={library} query={query} onOpen={onOpen} />
          ) : (
            <MiniMeLists library={library} group={group} query={query} onOpen={onOpen} />
          )}
        </>
      )}
    </SheetPage>
  );
}

/** Whether `query` appears in the entry's name or description, ignoring case. */
function matches(entry: { name: string; description: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return entry.name.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
}

/** A tab switch with "All" and one option per group in use, known groups first in the `@`
 * list's order, each with its count. */
function GroupFilter({
  library,
  group,
  onSelect,
}: {
  library: Library;
  group: string | null;
  onSelect: (group: string | null) => void;
}) {
  const groups = [...new Set(library.mini_mes.map((m) => m.group as string))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
  const count = (g: string | null) =>
    library.mini_mes.filter((m) => g === null || m.group === g).length;
  return (
    <ToggleGroup
      aria-label="Filter by group"
      variant="switch"
      size="switch"
      spacing={1}
      value={[group ?? ALL]}
      onValueChange={(value) => value.length > 0 && onSelect(value[0] === ALL ? null : value[0])}
    >
      {[null, ...groups].map((g) => (
        <ToggleGroupItem key={g ?? ALL} value={g ?? ALL}>
          {g === null ? "All" : groupLabel(g)}
          <span className="tabular-nums">{count(g)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** The filter's value for every group. */
const ALL = "all";

function MiniMeLists({
  library,
  group,
  query,
  onOpen,
}: {
  library: Library;
  group: string | null;
  query: string;
  onOpen: (view: View) => void;
}) {
  const shown = library.mini_mes.filter(
    (m) => (group === null || m.group === group) && matches(m, query),
  );
  const card = (m: MiniMe) => (
    <MiniMeCard
      key={m.id}
      miniMe={m}
      traitCount={library.traits.filter((t) => t.used_by.includes(m.id)).length}
      onOpen={() => onOpen({ kind: "mini-me", id: m.id })}
    />
  );
  return (
    <Origins
      entries={shown}
      builtInNote="duplicate to customise"
      empty={query.trim() ? "No Mini-Me matches your search." : "No Mini-Mes in this group."}
      row={card}
      grid
    />
  );
}

function TraitLists({
  library,
  query,
  onOpen,
}: {
  library: Library;
  query: string;
  onOpen: (view: View) => void;
}) {
  const row = (t: TraitSummary) => {
    const users = t.used_by.map((id) => library.mini_mes.find((m) => m.id === id));
    return (
      <Row
        key={t.id}
        icon={<TraitIcon />}
        name={t.name}
        description={t.description}
        details={
          <span className="flex w-[150px] shrink-0 items-center gap-2 text-meta text-muted-foreground">
            {users.length > 0 && (
              <span className="flex">
                {users.map((m, i) => (
                  <MiniMeAvatar
                    key={m?.id ?? i}
                    miniMe={m}
                    size={22}
                    className={i > 0 ? "-ml-1.5" : undefined}
                  />
                ))}
              </span>
            )}
            {users.length === 0
              ? "Not used yet"
              : users.length === 1
                ? "1 Mini-Me"
                : `${users.length} Mini-Mes`}
          </span>
        }
        onOpen={() => onOpen({ kind: "trait", id: t.id })}
      />
    );
  };
  return (
    <Origins
      entries={library.traits.filter((t) => matches(t, query))}
      empty="No Trait matches your search."
      row={row}
    />
  );
}

/** `entries` split into the user's own and the built-in ones, each list under its heading and
 * count. A list with no entries is left out. */
function Origins<T extends { id: string; built_in: boolean }>({
  entries,
  builtInNote,
  empty,
  row,
  grid = false,
}: {
  entries: T[];
  /** Shown after the built-in count. */
  builtInNote?: string;
  /** Shown when there are no entries at all. */
  empty: string;
  row: (entry: T) => ReactNode;
  /** Lay the entries out as cards, three to a row, instead of a list. */
  grid?: boolean;
}) {
  if (entries.length === 0) return <p className="text-ui text-muted-foreground">{empty}</p>;
  const lists = [
    { name: "Yours", entries: entries.filter((e) => !e.built_in) },
    { name: "Built-in", entries: entries.filter((e) => e.built_in), note: builtInNote },
  ];
  return (
    <div className="grid gap-6">
      {lists
        .filter((list) => list.entries.length > 0)
        .map((list) => (
          <section key={list.name} className="grid gap-3">
            <h2 className="flex items-baseline gap-2.5">
              <span className="font-serif text-heading text-foreground">{list.name}</span>
              <span className="text-meta text-muted-foreground">
                {list.entries.length}
                {list.note && ` · ${list.note}`}
              </span>
            </h2>
            {grid ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {list.entries.map(row)}
              </ul>
            ) : (
              <List>{list.entries.map(row)}</List>
            )}
          </section>
        ))}
    </div>
  );
}

function rank(group: string): number {
  const i = MINI_ME_GROUPS.findIndex((g) => g.group === group);
  return i === -1 ? MINI_ME_GROUPS.length : i;
}

/** Why some user-made definitions are missing, or why none can be changed. */
function Problems({ library }: { library: Library }) {
  if (!library.unreadable && library.skipped.length === 0) return null;
  return (
    <Card render={<section />} className="gap-0 px-5 py-4 text-meta">
      {library.unreadable ? (
        <p className="text-destructive">
          Your Mini-Mes and Traits could not be read, so they can't be changed until
          user-library.json is fixed: {library.unreadable}
        </p>
      ) : (
        <>
          <p className="font-medium">Some of your definitions were left out:</p>
          <ul className="mt-2 grid gap-1.5">
            {library.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-medium">
                  {s.kind === "trait" ? "Trait" : "Mini-Me"} {s.name ?? "without a name"}
                </span>
                <span className="text-muted-foreground"> · {s.problems.join("; ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
