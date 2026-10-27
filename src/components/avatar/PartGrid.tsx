import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, type AvatarStyle } from "./Avatar";
import type { AvatarColor } from "./palette";
import { ACCESSORIES, BASES, FACES, type AvatarPart } from "./parts";

interface GridProps {
  parts: readonly AvatarPart[];
  selected: string | null;
  allowNone: boolean;
  preview: (id: string | null) => AvatarStyle;
  onSelect: (id: string | null) => void;
}

// An option is a square outlined tile; the chosen one is outlined in ink.
const TILE =
  "aspect-square h-auto w-full flex-col gap-1 rounded-card border-border bg-card py-2 font-normal hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-card aria-pressed:text-foreground";

/** A grid of avatar parts to pick from, each drawn on `preview(id)`. */
export function PartGrid({ parts, selected, allowNone, preview, onSelect }: GridProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
      {allowNone && (
        <li>
          <Button
            variant="outline"
            aria-pressed={selected === null}
            className={TILE}
            onClick={() => onSelect(null)}
          >
            <Avatar {...preview(null)} size={60} />
            <span className="text-meta">none</span>
          </Button>
        </li>
      )}
      {parts.map((part) => (
        <li key={part.id}>
          <Button
            variant="outline"
            aria-pressed={selected === part.id}
            title={part.id}
            className={TILE}
            onClick={() => onSelect(part.id)}
          >
            <Avatar {...preview(part.id)} size={60} />
            <span className="w-full truncate text-meta">{part.label}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface TabsProps {
  style: AvatarStyle;
  color: AvatarColor | null;
  onChange: (style: AvatarStyle) => void;
}

/** Tabs of base, face and accessory grids, each part drawn with the rest of `style`. */
export function PartTabs({ style, color, onChange }: TabsProps) {
  const tabs = [
    { value: "base", title: "Base", parts: BASES, selected: style.base, allowNone: false },
    { value: "face", title: "Face", parts: FACES, selected: style.face, allowNone: false },
    {
      value: "accessory",
      title: "Accessory",
      parts: ACCESSORIES,
      selected: style.accessory ?? null,
      allowNone: true,
    },
  ] as const;

  return (
    <Tabs defaultValue="base">
      <TabsList aria-label="Avatar parts">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.title}
            <span className="font-normal text-muted-foreground tabular-nums">
              {tab.parts.length}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <PartGrid
            parts={tab.parts}
            selected={tab.selected}
            allowNone={tab.allowNone}
            preview={(id) => ({ ...style, color, [tab.value]: id })}
            onSelect={(id) => {
              if (id !== null || tab.allowNone) onChange({ ...style, [tab.value]: id });
            }}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
