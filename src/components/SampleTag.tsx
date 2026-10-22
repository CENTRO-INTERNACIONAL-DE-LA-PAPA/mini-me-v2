/** Marks a section that shows sample data from `placeholders.ts`, in development builds. */
export function SampleTag() {
  return (
    <span className="rounded-full border border-dashed border-border-strong px-2 py-px text-meta text-muted-foreground">
      Sample data
    </span>
  );
}
