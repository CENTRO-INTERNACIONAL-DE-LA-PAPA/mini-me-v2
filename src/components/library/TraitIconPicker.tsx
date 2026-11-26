import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PuzzleIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { TRAIT_ICONS, traitIcon } from "../../lib/traitIcons";

/** A Trait's icon as a button opening the grid of Trait icons; the puzzle piece means none. */
export function TraitIconPicker({
  icon,
  onPick,
}: {
  icon: string | null;
  onPick: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const Current = traitIcon(icon);
  const choices: [string | null, LucideIcon][] = [[null, PuzzleIcon], ...TRAIT_ICONS];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-lg" aria-label="Choose an icon" />}
      >
        <Current className="size-6" />
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto grid-cols-6 gap-1 p-2">
        {choices.map(([name, Icon]) => (
          <Button
            key={name ?? "none"}
            variant="ghost"
            size="icon"
            aria-label={name ?? "No icon"}
            aria-pressed={name === icon}
            onClick={() => {
              setOpen(false);
              onPick(name);
            }}
          >
            <Icon className="size-4.5" />
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
