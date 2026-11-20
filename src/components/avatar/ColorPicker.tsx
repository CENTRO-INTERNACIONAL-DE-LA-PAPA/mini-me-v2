import { Slider } from "@/components/ui/slider";
import type { CSSProperties } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { COLOR_FAMILIES, SOLID_HUE_GRADIENT, colorForHue, type HueColor } from "./palette";

interface ColorPickerProps {
  value: HueColor | null;
  onChange: (value: HueColor) => void;
}

/** Colour family swatches and a hue slider; with no value, the Yellow family is shown. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const current = value ?? COLOR_FAMILIES.find((f) => f.name === "Yellow")!;
  return (
    <section className="grid gap-3">
      <h2 className="font-serif text-subheading text-foreground">Colour</h2>
      <ToggleGroup
        variant="plain"
        aria-label="Colour family"
        className="flex-wrap gap-2"
        value={COLOR_FAMILIES.filter((f) => f.solid === current.solid).map((f) => f.name)}
        onValueChange={(value) => {
          const family = COLOR_FAMILIES.find((f) => f.name === value[0]);
          if (family) onChange(family);
        }}
      >
        {COLOR_FAMILIES.map((family) => (
          <ToggleGroupItem
            key={family.name}
            value={family.name}
            aria-label={family.name}
            title={family.name}
            className="size-7 rounded-full outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-ring"
            style={{ background: family.solid }}
          />
        ))}
      </ToggleGroup>
      <Slider
        label="Colour hue"
        min={0}
        max={359}
        value={[current.hue]}
        onValueChange={(value) => {
          const hue = Array.isArray(value) ? value[0] : value;
          onChange({ hue, ...colorForHue(hue) });
        }}
        className="[&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-track]]:h-4!"
        style={{ "--slider-track": SOLID_HUE_GRADIENT } as CSSProperties}
      />
    </section>
  );
}
