import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MiniMeAvatar } from "../../protocol/types";
import { Avatar } from "./Avatar";
import type { AvatarColor } from "./palette";
import { LAYERS, withPart, type AvatarPart } from "./parts";

interface GridProps {
  parts: readonly AvatarPart[];
  selected: string | null;
  allowNone: boolean;
  preview: (id: string | null) => MiniMeAvatar;
  color: AvatarColor | null;
  onSelect: (id: string | null) => void;
}

const TILE =
  "aspect-square h-auto w-full flex-col gap-1 rounded-2xl border-border bg-card py-2 font-normal hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-card aria-pressed:text-foreground";

/** A grid of avatar parts to pick from, each drawn on `preview(id)`. */
function PartGrid({ parts, selected, allowNone, preview, color, onSelect }: GridProps) {
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
            <Avatar avatar={preview(null)} color={color} size={60} />
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
            <Avatar avatar={preview(part.id)} color={color} size={60} />
            <span className="w-full truncate text-meta">{part.label}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface TabsProps {
  avatar: MiniMeAvatar;
  color: AvatarColor | null;
  onChange: (avatar: MiniMeAvatar) => void;
}

/** A tab of parts for each layer that has some, each part drawn with the rest of `avatar`. */
export function PartTabs({ avatar, color, onChange }: TabsProps) {
  const layers = LAYERS.filter((layer) => layer.parts.length > 0);
  return (
    <Tabs defaultValue={layers[0].name}>
      <TabsList aria-label="Avatar parts">
        {layers.map((layer) => (
          <TabsTrigger key={layer.name} value={layer.name}>
            {layer.label}
            <span className="font-normal text-muted-foreground tabular-nums">
              {layer.parts.length}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {layers.map((layer) => (
        <TabsContent key={layer.name} value={layer.name}>
          <PartGrid
            parts={layer.parts}
            selected={avatar[layer.name] ?? null}
            allowNone={!layer.required}
            preview={(id) => withPart(avatar, layer.name, id)}
            color={color}
            onSelect={(id) => onChange(withPart(avatar, layer.name, id))}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
