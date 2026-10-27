import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusIcon, PuzzleIcon, SearchIcon, SmileIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../api";
import { MINI_ME_GROUPS } from "../protocol/references";
import type { LibraryView as Library, MiniMe, TraitSummary } from "../protocol/types";
import { List, Row, TraitIcon } from "./LibraryParts";
import { MiniMeAvatar } from "./MiniMeAvatar";
import { SectionPage, type Section } from "./shell/SectionPage";
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
  const sections: Section<LibraryTab>[] = [
    { id: "mini-mes", name: "Mini-Mes", icon: SmileIcon, count: library?.mini_mes.length },
    { id: "traits", name: "Traits", icon: PuzzleIcon, count: library?.traits.length },
  ];

  return (
    <SectionPage
      title="Library"
      sections={sections}
      active={tab}
      onSelect={(id) => onOpen({ kind: "library", tab: id })}
    >
      <header className="mb-6 flex items-start gap-8">
        <div className="flex-1">
          <h1 className="text-page font-bold">{traits ? "Traits" : "Mini-Mes"}</h1>
          <p className="mt-1.5 max-w-[600px] text-ui text-pretty text-ink-2">
            {traits
              ? "A Trait is one Step a Mini-Me can run. Editing a Trait changes every Mini-Me that uses it."
              : "Mini-Mes answer in your Conversations by running the Traits in their Workflow. Built-in ones can be duplicated; your own can be edited and deleted."}
          </p>
        </div>
        {library && (
          <Button
            disabled={!!library.unreadable}
            onClick={() => onOpen(traits ? { kind: "trait" } : { kind: "mini-me" })}
          >
            <PlusIcon />
            {traits ? "New Trait" : "New Mini-Me"}
          </Button>
        )}
      </header>
      {error && <p className="mb-4 text-meta text-destructive">{error}</p>}
      {library && <Problems library={library} />}
      {library && (
        <>
          <div className="mb-6 flex items-center gap-4">
            <div className="flex flex-1 flex-wrap gap-1.5" aria-label="Filter by group">
              {!traits && <GroupChips library={library} group={group} onSelect={setGroup} />}
            </div>
            <div className="relative w-60 shrink-0">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label={traits ? "Search Traits" : "Search Mini-Mes"}
                placeholder="Search"
                className="pl-8"
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
    </SectionPage>
  );
}

/** Whether `query` appears in the entry's name or description, ignoring case. */
function matches(entry: { name: string; description: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return entry.name.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
}

/** One chip per group in use, known ones first in the `@` list's order, each with its count. */
function GroupChips({
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
  return [null, ...groups].map((g) => (
    <Button
      key={g ?? "all"}
      variant="outline"
      size="xs"
      className="group/chip rounded-full px-2.5"
      aria-pressed={group === g}
      onClick={() => onSelect(g)}
    >
      {g === null ? "All" : groupLabel(g)}
      <span className="text-muted-foreground tabular-nums group-aria-pressed/chip:text-muted-on-ink">
        {count(g)}
      </span>
    </Button>
  ));
}

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
  const row = (m: MiniMe) => {
    const traitCount = library.traits.filter((t) => t.used_by.includes(m.id)).length;
    return (
      <Row
        key={m.id}
        icon={<MiniMeAvatar miniMe={m} size={34} />}
        name={m.name}
        description={m.description}
        details={
          <>
            <span className="flex w-36 shrink-0 items-center gap-2 text-meta text-muted-foreground">
              <PuzzleIcon aria-hidden className="size-4 text-ink-2" strokeWidth={1.6} />
              {traitCount === 1 ? "1 Trait" : `${traitCount} Traits`}
            </span>
            <span className="w-24 shrink-0 truncate text-meta text-muted-foreground">
              {groupLabel(m.group)}
            </span>
          </>
        }
        onOpen={() => onOpen({ kind: "mini-me", id: m.id })}
      />
    );
  };
  return (
    <Origins
      entries={shown}
      builtInNote="duplicate to customise"
      empty={query.trim() ? "No Mini-Me matches your search." : "No Mini-Mes in this group."}
      row={row}
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
                  <MiniMeAvatar key={m?.id ?? i} miniMe={m} size={20} />
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
}: {
  entries: T[];
  /** Shown after the built-in count. */
  builtInNote?: string;
  /** Shown when there are no entries at all. */
  empty: string;
  row: (entry: T) => ReactNode;
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
          <section key={list.name} className="grid gap-2.5">
            <h2 className="flex items-baseline gap-2.5">
              <span className="text-section font-semibold">{list.name}</span>
              <span className="text-meta font-normal text-muted-foreground">
                {list.entries.length}
                {list.note && ` · ${list.note}`}
              </span>
            </h2>
            <List>{list.entries.map(row)}</List>
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
    <section className="mb-8 rounded-xl border border-border bg-card px-5 py-4 text-meta">
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
    </section>
  );
}
