import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface Section<Id extends string> {
  id: Id;
  name: string;
  icon: LucideIcon;
  /** How many entries the section holds, shown after its name. */
  count?: number;
}

/** An app-wide page split into sections: a list of them beside the open section's content.
 * An empty column as wide as the list mirrors it on the right, so the content stays in the
 * middle of the page at any width. The list stays in view while the page scrolls. */
export function SectionPage<Id extends string>({
  title,
  sections,
  active,
  onSelect,
  children,
}: {
  title: string;
  sections: Section<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  children: ReactNode;
}) {
  return (
    <main className="grid w-full grid-cols-[160px_minmax(0,760px)_160px] justify-center gap-10 px-8 py-10">
      <nav aria-label={`${title} sections`} className="sticky top-10 self-start">
        <h2 className="px-2.5 pb-2.5 text-meta font-medium text-muted-foreground">{title}</h2>
        <SidebarMenu className="gap-0.5">
          {sections.map(({ id, name, icon: Icon, count }) => (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton isActive={active === id} onClick={() => onSelect(id)}>
                <Icon />
                <span className="flex-1">{name}</span>
                {count !== undefined && (
                  <span className="text-meta font-normal text-muted-foreground tabular-nums group-data-active/menu-button:text-muted-on-ink">
                    {count}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </nav>
      <div className="min-w-0">{children}</div>
    </main>
  );
}
