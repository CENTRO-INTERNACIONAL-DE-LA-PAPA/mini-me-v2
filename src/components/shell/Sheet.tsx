import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { XIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The main sheet: the white, rounded area beside the navigation that holds the open view. */
export function MainSheet({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sheet bg-background",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A tool sheet beside the main sheet (To-do, Jobs, a Workflow, an inspector): a serif title,
 * an optional line under it, and a close button. Only one is open at a time. */
export function ToolSheet({
  title,
  meta,
  onClose,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "flex min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-sheet bg-background",
        className,
      )}
    >
      <header className="flex items-start gap-3 pt-[22px] pr-[18px] pb-4 pl-6">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-tool-title font-medium text-foreground">{title}</h2>
          {meta && <p className="mt-1 text-meta text-muted-foreground">{meta}</p>}
        </div>
        <CloseButton label="Close" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </aside>
  );
}

/** The well-filled square close button at the top right of a sheet. */
export function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" size="icon" aria-label={label} title={label} onClick={onClick}>
      <XIcon />
    </Button>
  );
}

/** A sheet's title block: the serif title and anything under it (Mini-Me tags, a line of
 * meta), with actions such as a tab switch on the right. */
export function SheetHeader({
  title,
  children,
  actions,
  compact = false,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** A tool sheet is open beside this one, so the title is smaller. */
  compact?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-4 pt-6 pr-6 pl-8">
      <div className="flex min-w-0 flex-col gap-3">
        <h1
          className={cn(
            "truncate font-serif font-medium text-foreground",
            compact ? "text-column-title" : "text-sheet-title",
          )}
        >
          {title}
        </h1>
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface ToolOption<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  /** Shown after the label, such as the number of open to-dos. */
  count?: number;
}

/** A tab switch whose options open and close tool sheets: at most one is pressed, and
 * pressing it again closes it. */
export function ToolSwitch<Id extends string>({
  label,
  options,
  value,
  onToggle,
}: {
  label: string;
  options: ToolOption<Id>[];
  value: Id | null;
  onToggle: (id: Id) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="switch"
      size="switch"
      spacing={1}
      value={value === null ? [] : [value]}
    >
      {options.map(({ id, label, icon: Icon, count }) => (
        <ToggleGroupItem key={id} value={id} onClick={() => onToggle(id)}>
          <Icon />
          {label}
          {count !== undefined && <span className="tabular-nums">{count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A page filling the main sheet: its serif title and an optional line under it, actions
 * such as a tab switch and a primary button on the right, then the content. */
export function SheetPage({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className={cn("flex w-full flex-col gap-6 px-8 pt-7 pb-10", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-serif text-sheet-title font-medium text-foreground">{title}</h1>
          {description && (
            <p className="max-w-[560px] text-ui text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </header>
      {children}
    </main>
  );
}

/** A titled part of a sheet: a serif heading in sentence case, optional meta beside it and
 * actions such as a tab switch on the right, then its content. */
export function SheetSection({
  title,
  meta,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3.5", className)}>
      <header className="flex items-center justify-between gap-4">
        <h2 className="flex items-baseline gap-2.5">
          <span className="font-serif text-heading text-foreground">{title}</span>
          {meta && <span className="text-meta text-muted-foreground">{meta}</span>}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}
