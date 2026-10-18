import { Button } from "@/components/ui/button";
import { Tabs } from "@base-ui/react/tabs";
import { useState } from "react";
import { Avatar, type AvatarStyle } from "./Avatar";
import { COLOR_FAMILIES, SOLID_HUE_GRADIENT, colorForHue, type AvatarColor } from "./palette";
import { ACCESSORIES, BASES, FACES, type AvatarPart } from "./parts";

interface Props {
  onClose: () => void;
}

interface Color extends AvatarColor {
  hue: number;
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const firstOr = (parts: AvatarPart[], id: string) =>
  parts.find((p) => p.id === id)?.id ?? parts[0]?.id ?? "";

/** A development-only page for trying combinations of avatar parts and colours. */
export function AvatarDebugView({ onClose }: Props) {
  const [style, setStyle] = useState<AvatarStyle>({
    base: firstOr(BASES, "classic"),
    face: firstOr(FACES, "cheerful"),
    accessory: null,
  });
  const [color, setColor] = useState<Color | null>(null);
  const shown = { ...style, color };

  const randomize = () => {
    setStyle({
      base: pick(BASES).id,
      face: pick(FACES).id,
      accessory: Math.random() < 0.25 ? null : pick(ACCESSORIES).id,
    });
    setColor(pick(COLOR_FAMILIES));
  };

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
    <main className="mx-auto mt-[6vh] max-w-5xl px-4 pb-16">
      <Button variant="link" className="mb-2 px-0 text-muted-foreground" onClick={onClose}>
        ← Back
      </Button>
      <h1 className="mb-6 text-page font-bold">[DEBUG] Avatars</h1>
      <div className="grid grid-cols-[300px_1fr] items-start gap-10">
        <aside className="sticky top-6 grid gap-6">
          <div className="grid place-items-center rounded-xl border border-border bg-card p-6">
            <Avatar {...shown} size={220} />
          </div>
          <div className="flex items-end justify-center gap-5">
            <Avatar {...shown} size={64} />
            <Avatar {...shown} size={32} />
            <Avatar {...shown} size={20} />
          </div>
          <ColorPicker value={color} onChange={setColor} />
          <code className="text-meta break-all text-muted-foreground">
            {`<Avatar base="${style.base}" face="${style.face}"` +
              (style.accessory ? ` accessory="${style.accessory}"` : "") +
              (color ? ` color={{ solid: "${color.solid}", ink: "${color.ink}" }}` : "") +
              " />"}
          </code>
          <Button variant="outline" onClick={randomize}>
            Randomize
          </Button>
        </aside>
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
                preview={(id) => ({ ...shown, [tab.value]: id })}
                onSelect={(id) => {
                  if (id !== null || tab.allowNone) setStyle({ ...style, [tab.value]: id });
                }}
              />
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      </div>
    </main>
  );
}

interface ColorPickerProps {
  value: Color | null;
  onChange: (value: Color | null) => void;
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  const swatch =
    "size-7 rounded-full outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-ring";
  const current = value ?? COLOR_FAMILIES.find((f) => f.name === "Red")!;
  return (
    <section className="grid gap-3">
      <h2 className="text-section font-bold">Colour</h2>
      <div className="flex flex-wrap gap-2">
        {COLOR_FAMILIES.map((family) => (
          <button
            key={family.name}
            type="button"
            aria-label={family.name}
            title={family.name}
            aria-pressed={current.solid === family.solid}
            className={swatch}
            style={{ background: family.solid }}
            onClick={() => onChange(family)}
          />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={359}
        aria-label="Colour hue"
        value={current.hue}
        onChange={(e) => {
          const hue = Number(e.target.value);
          onChange({ hue, ...colorForHue(hue) });
        }}
        className="h-4 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-card"
        style={{ background: SOLID_HUE_GRADIENT }}
      />
    </section>
  );
}

interface GridProps {
  parts: readonly AvatarPart[];
  selected: string | null;
  allowNone: boolean;
  preview: (id: string | null) => AvatarStyle;
  onSelect: (id: string | null) => void;
}

function PartGrid({ parts, selected, allowNone, preview, onSelect }: GridProps) {
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
