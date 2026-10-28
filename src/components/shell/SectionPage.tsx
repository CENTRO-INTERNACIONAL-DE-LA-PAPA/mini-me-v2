import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface Section<Id extends string> {
  id: Id;
  name: string;
  icon: LucideIcon;
  /** How many entries the section holds, shown after its name. */
  count?: number;
}

/** An app-wide page split into sections: a 210px column with the page's serif title above a
 * vertical tab switch, beside the open section's content (up to 760px), centred together in
 * the sheet. The column stays in view while the page scrolls. */
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
    <Tabs
      value={active}
      onValueChange={(id) => onSelect(id as Id)}
      orientation="vertical"
      className="flex-row justify-center gap-14 px-10 py-9"
    >
      <nav aria-label={`${title} sections`} className="sticky top-9 flex w-[210px] shrink-0 flex-col gap-3.5 self-start">
        <h2 className="px-1 font-serif text-column-title font-medium text-foreground">{title}</h2>
        <TabsList>
          {sections.map(({ id, name, icon: Icon, count }) => (
            <TabsTrigger key={id} value={id} className="text-ui">
              <Icon />
              <span className="flex-1 text-left">{name}</span>
              {count !== undefined && (
                <span className="text-meta font-normal text-muted-foreground tabular-nums">
                  {count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </nav>
      <div className="max-w-[760px] min-w-0 flex-[0_1_760px]">{children}</div>
    </Tabs>
  );
}
