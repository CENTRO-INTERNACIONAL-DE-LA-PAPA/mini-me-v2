import { Hint } from "./Hint";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** One row of a list: a leading mark, a name over an optional meta line, and what follows on
 * the right. With `onOpen` the row is a button that fills on hover. */
export function ListRow({
  leading,
  name,
  meta,
  trailing,
  title,
  onOpen,
  className,
}: {
  leading?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  /** A hint shown on hover, such as the whole of a name that is cut short. */
  title?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {leading}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-ui font-medium text-foreground">{name}</span>
        {meta && <span className="truncate text-meta text-muted-foreground">{meta}</span>}
      </span>
      {trailing}
    </>
  );
  const row = "flex min-h-9 w-full items-center gap-2 py-2 text-left";
  const element = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        row,
        "cursor-pointer rounded-lg px-2.5 transition-colors duration-150 ease-out outline-none hover:bg-muted focus-visible:bg-muted",
        className,
      )}
    >
      {content}
    </button>
  ) : (
    <div className={cn(row, className)}>{content}</div>
  );
  return <Hint label={title}>{element}</Hint>;
}
