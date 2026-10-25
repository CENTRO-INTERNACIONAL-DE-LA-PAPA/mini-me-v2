import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
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

/** A grid of avatar parts to pick from, each drawn on `preview(id)`. */
export function PartGrid({ parts, selected, allowNone, preview, onSelect }: GridProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
      {allowNone && (
        <li>
          <Button
            variant="outline"
            aria-pressed={selected === null}
            className="h-auto w-full flex-col gap-1 py-2"
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
            className="h-auto w-full flex-col gap-1 py-2"
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
    <Tabs.Root defaultValue="base">
      <Tabs.List className="mb-4 flex gap-1 border-b border-border pb-2">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className="h-8 rounded-md px-3 text-ui font-medium text-ink-2 outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring data-[active]:bg-primary data-[active]:text-primary-foreground"
          >
            {tab.title}{" "}
            <span className="text-meta font-normal opacity-60">{tab.parts.length}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.value} value={tab.value}>
          <PartGrid
            parts={tab.parts}
            selected={tab.selected}
            allowNone={tab.allowNone}
            preview={(id) => ({ ...style, color, [tab.value]: id })}
            onSelect={(id) => {
              if (id !== null || tab.allowNone) onChange({ ...style, [tab.value]: id });
            }}
          />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
