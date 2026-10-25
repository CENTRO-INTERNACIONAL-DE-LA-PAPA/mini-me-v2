import { COLOR_FAMILIES, SOLID_HUE_GRADIENT, colorForHue, type HueColor } from "./palette";

interface ColorPickerProps {
  value: HueColor | null;
  onChange: (value: HueColor) => void;
}

/** Colour family swatches and a hue slider; with no value, the Yellow family is shown. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const swatch =
    "size-7 rounded-full outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-ring";
  const current = value ?? COLOR_FAMILIES.find((f) => f.name === "Yellow")!;
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
