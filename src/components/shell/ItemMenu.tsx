import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreHorizontalIcon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../../api";

/** An action that needs nothing more from the user, such as Open or Duplicate. */
export interface MenuAction {
  label: string;
  onSelect: () => void | Promise<unknown>;
}

interface Props {
  /** What the menu is for, such as a Conversation's title, for its accessible name. */
  name: string;
  /** Actions shown first, before Rename and Delete. */
  actions?: MenuAction[];
  /** Adds Rename. `current` fills the field, and `suffix` is shown after it, such as a file's
   * extension, which a rename keeps. */
  rename?: { current: string; suffix?: string; onRename: (name: string) => Promise<unknown> };
  /** Adds Delete, which asks `question` before calling `onDelete`. */
  remove?: { question: string; onDelete: () => Promise<unknown> };
  className?: string;
}

/** The "…" button's hover: its dots turn lighter, with no fill of their own, which a hovered row
 * or the selected row's white would hide. */
export const DOTS_HOVER =
  "hover:bg-transparent hover:text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground";

type View = "menu" | "rename" | "delete";

/** A "…" button with one list item's actions, then Rename, which asks for the new name, and
 * Delete, which asks first. */
export function ItemMenu({ name, actions = [], rename, remove, className }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keep = useRef<HTMLButtonElement>(null);

  const show = (next: boolean) => {
    setOpen(next);
    if (next) {
      setView("menu");
      setError(null);
    }
  };

  /** Runs `work`, closing the popover when it succeeds and showing why when it fails. */
  async function run(work: () => void | Promise<unknown>) {
    try {
      await work();
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (rename && typed.trim() && typed.trim() !== rename.current) {
      void run(() => rename.onRename(typed.trim()));
    }
  }

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${name}`}
            title="Actions"
            className={className}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <MoreHorizontalIcon />
      </PopoverTrigger>
      {/* A popover is in the page's React tree, so a click in it must not reach the row. */}
      <PopoverContent
        align="end"
        className={view === "menu" ? "w-40 gap-0 p-1" : "w-64"}
        initialFocus={view === "delete" ? keep : undefined}
      >
        <div className="grid gap-2" onClick={(event) => event.stopPropagation()}>
          {view === "menu" && (
            <div className="grid gap-0.5">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => void run(action.onSelect)}
                >
                  {action.label}
                </Button>
              ))}
              {rename && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    setTyped(rename.current);
                    setError(null);
                    setView("rename");
                  }}
                >
                  Rename
                </Button>
              )}
              {remove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-destructive"
                  onClick={() => {
                    setError(null);
                    setView("delete");
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          )}
          {view === "rename" && rename && (
            <form onSubmit={submit} className="grid gap-2">
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  aria-label="New name"
                  value={typed}
                  onChange={(e) => {
                    setTyped(e.target.value);
                    setError(null);
                  }}
                />
                {rename.suffix && (
                  <span className="text-meta text-muted-foreground">{rename.suffix}</span>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setView("menu")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!typed.trim() || typed.trim() === rename.current}>
                  Save
                </Button>
              </div>
            </form>
          )}
          {view === "delete" && remove && (
            <>
              <p>{remove.question}</p>
              <div className="flex justify-end gap-2">
                <Button ref={keep} variant="ghost" onClick={() => setOpen(false)}>
                  Keep
                </Button>
                <Button variant="destructive" onClick={() => void run(remove.onDelete)}>
                  Delete
                </Button>
              </div>
            </>
          )}
          {error && <p className="text-meta text-destructive">{error}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
