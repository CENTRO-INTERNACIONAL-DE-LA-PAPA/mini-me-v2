import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";

/** A confirmation's question, a ghost Keep (give it the focus through `keepRef`) and the
 * destructive action. */
export function ConfirmActions({
  question,
  action,
  keepRef,
  onKeep,
  onConfirm,
}: {
  question: ReactNode;
  action: string;
  keepRef?: Ref<HTMLButtonElement>;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <p>{question}</p>
      <div className="flex justify-end gap-2">
        <Button ref={keepRef} variant="ghost" onClick={onKeep}>
          Keep
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {action}
        </Button>
      </div>
    </>
  );
}

/** `trigger` opens a popover that asks `question` before calling `onConfirm`; Keep has the
 * focus, and Keep, Escape or a click outside close it. With `ask` false, the trigger acts at
 * once. */
export function ConfirmButton({
  trigger,
  children,
  question,
  action = "Delete",
  ask = true,
  onConfirm,
}: {
  trigger: ReactElement;
  children: ReactNode;
  question: ReactNode;
  action?: string;
  ask?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && !ask) onConfirm();
        else setOpen(next);
      }}
    >
      <PopoverTrigger render={trigger}>{children}</PopoverTrigger>
      <PopoverContent align="end" initialFocus={keep}>
        <ConfirmActions
          question={question}
          action={action}
          keepRef={keep}
          onKeep={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
