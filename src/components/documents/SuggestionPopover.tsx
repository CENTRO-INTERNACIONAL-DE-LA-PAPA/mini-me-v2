import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useState } from "react";
import { errorCode, errorMessage } from "../../api";
import { ErrorText } from "../shell/ErrorText";

/** A box on screen that a popover points at, such as a clicked suggestion. */
export interface PopoverAnchor {
  getBoundingClientRect: () => DOMRect;
}

/** Accept and Discard for the suggestion the user clicked in the source. A conflicting
 * suggestion offers only Discard after Accept fails, and a detached one offers only Discard. */
export function SuggestionPopover({
  anchor,
  author,
  text,
  detached,
  onAccept,
  onDiscard,
  onClose,
}: {
  anchor: PopoverAnchor;
  /** The name of the Mini-Me that suggested it. */
  author: string;
  text: string;
  detached: boolean;
  onAccept: () => Promise<void>;
  onDiscard: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onClose();
    } catch (e) {
      const code = errorCode(e);
      if (code === "suggestion_conflict" || code === "suggestion_detached") {
        setConflict(errorMessage(e));
      } else {
        setFailure(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const problem = detached ? "The passage of this suggestion can't be found." : conflict;
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverContent anchor={anchor} align="start">
        <p className="text-meta text-muted-foreground">Suggested by {author}</p>
        <p className="line-clamp-4 wrap-anywhere">{text.trim() ? text : "Remove this passage."}</p>
        {problem && <ErrorText>{problem}</ErrorText>}
        {failure && <ErrorText>{failure}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(onDiscard)}>
            Discard
          </Button>
          {!problem && (
            <Button size="sm" disabled={busy} onClick={() => void run(onAccept)}>
              Accept
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
