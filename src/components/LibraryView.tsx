import { Button } from "@/components/ui/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { MINI_ME_GROUPS } from "../protocol/references";
import type { LibraryView as Library } from "../protocol/types";
import { List, Row } from "./LibraryParts";
import { MiniMeAvatar } from "./MiniMeAvatar";
import type { LibraryTab, View } from "./shell/view";

const SECTIONS: { id: LibraryTab; name: string }[] = [
  { id: "mini-mes", name: "Mini-Mes" },
  { id: "traits", name: "Traits" },
];

/** A group's heading as the `@` list shows it, or the group itself for one it doesn't know. */
const groupLabel = (group: string) => MINI_ME_GROUPS.find((g) => g.group === group)?.label ?? group;

/** Every Mini-Me or Trait, built-in and user-made; each entry opens its editor. Mini-Mes can be
 * narrowed to one group. */
export function LibraryView({ tab, onOpen }: { tab: LibraryTab; onOpen: (view: View) => void }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => {
    api
      .listLibrary()
      .then(setLibrary)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const traits = tab === "traits";
  // The groups in use, known ones first in the `@` list's order.
  const groups = library
    ? [...new Set(library.mini_mes.map((m) => m.group as string))].sort(
        (a, b) => rank(a) - rank(b) || a.localeCompare(b),
      )
    : [];
  const shown = library?.mini_mes.filter((m) => group === null || m.group === group) ?? [];

  return (
    <main className="mx-auto grid w-full max-w-[960px] grid-cols-[160px_minmax(0,1fr)] gap-10 px-8 py-10">
      <nav aria-label="Library sections" className="sticky top-10 self-start">
        <SidebarMenu>
          {SECTIONS.map((section) => (
            <SidebarMenuItem key={section.id}>
              <SidebarMenuButton
                isActive={tab === section.id}
                onClick={() => onOpen({ kind: "library", tab: section.id })}
              >
                <span>{section.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </nav>
      <div>
        <header className="mb-6 flex items-start gap-6">
          <div className="flex-1">
            <h1 className="text-page font-bold">{traits ? "Traits" : "Mini-Mes"}</h1>
            <p className="mt-1.5 text-ui text-ink-2">
              {traits
                ? "What a Mini-Me can do. Editing a Trait changes it for every Mini-Me that runs it."
                : "Mini-Mes answer in your Conversations by running the Traits in their Workflow. Built-in ones can be duplicated; your own can be edited and deleted."}
            </p>
          </div>
          {library && (
            <Button
              variant="outline"
              disabled={!!library.unreadable}
              onClick={() => onOpen(traits ? { kind: "trait" } : { kind: "mini-me" })}
            >
              {traits ? "New Trait" : "New Mini-Me"}
            </Button>
          )}
        </header>
        {error && <p className="mb-4 text-meta text-destructive">{error}</p>}
        {library && <Problems library={library} />}
        {library && traits && (
          <List>
            {library.traits.map((t) => (
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
        {library && !traits && (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by group">
              {[null, ...groups].map((g) => (
                <Button
                  key={g ?? "all"}
                  variant="outline"
                  size="xs"
                  className="rounded-full px-2.5"
                  aria-pressed={group === g}
                  onClick={() => setGroup(g)}
                >
                  {g === null ? "All" : groupLabel(g)}
                </Button>
              ))}
            </div>
            <List>
              {shown.map((m) => (
                <Row
                  key={m.id}
                  icon={<MiniMeAvatar miniMe={m} size={28} />}
                  name={m.name}
                  description={m.description}
                  tag={groupLabel(m.group)}
                  builtIn={m.built_in}
                  onOpen={() => onOpen({ kind: "mini-me", id: m.id })}
                />
              ))}
            </List>
          </>
        )}
      </div>
    </main>
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
