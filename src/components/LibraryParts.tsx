import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState, type ReactNode } from "react";

interface HeaderProps {
  title: string;
  icon?: ReactNode;
  /** A line under the title, such as a Mini-Me's description. */
  subtitle?: string;
  builtIn: boolean;
  actions: ReactNode;
  /** Why the last save or delete was refused, one problem per line. */
  problems: string | null;
  onBack: () => void;
}

/** An editor's top: a back link, the title with its mark and actions, and the problems with
 * the last save. The problems scroll within a fixed height, so a long list never pushes the
 * rest of the editor out of view. */
export function EditorHeader({
  title,
  icon,
  subtitle,
  builtIn,
  actions,
  problems,
  onBack,
}: HeaderProps) {
  return (
    <>
      <Button variant="link" className="mb-2 px-0 text-muted-foreground" onClick={onBack}>
        ← Library
      </Button>
      <header className="mb-6 flex items-center gap-4">
        {icon}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="truncate text-page font-bold">{title}</h1>
          {subtitle && <p className="truncate text-ui text-ink-2">{subtitle}</p>}
        </div>
        <OriginBadge builtIn={builtIn} />
        <div className="flex shrink-0 gap-2">{actions}</div>
      </header>
      {problems && (
        <ul className="mb-6 grid max-h-32 gap-1 overflow-y-auto rounded-lg border border-border bg-card px-4 py-3 text-meta text-destructive">
          {problems.split("\n").map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** An editor page: its header, then fields. */
export function EditorPage({ children, ...header }: HeaderProps & { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-8 py-10">
      <EditorHeader {...header} />
      <div className="grid gap-6">{children}</div>
    </main>
  );
}

export function OriginBadge({ builtIn }: { builtIn: boolean }) {
  return <Badge variant="secondary">{builtIn ? "Built-in" : "Yours"}</Badge>;
}

/** A labelled field, with an optional hint below the label. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-0.5">
        <Label htmlFor={htmlFor} className="font-medium">
          {label}
        </Label>
        {hint && <p className="text-meta text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** A Delete button that asks once more before calling `onDelete`. */
export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        Delete
      </Button>
    );
  }
  return (
    <>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Keep
      </Button>
      <Button
        variant="destructive"
        onClick={() => {
          setAsking(false);
          onDelete();
        }}
      >
        Delete for good
      </Button>
    </>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </ul>
  );
}

/** One Mini-Me or Trait in a list, opening its editor. */
export function Row({
  icon,
  name,
  description,
  tag,
  builtIn,
  onOpen,
}: {
  icon?: ReactNode;
  name: string;
  description: string;
  /** An attribute shown before the origin, such as a Mini-Me's group. */
  tag?: string;
  builtIn: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out outline-none hover:bg-accent focus-visible:bg-accent"
        onClick={onOpen}
      >
        {icon}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-ui font-medium">{name}</span>
          <span className="truncate text-meta text-muted-foreground">{description}</span>
        </span>
        {tag && <span className="shrink-0 text-meta text-muted-foreground">{tag}</span>}
        <OriginBadge builtIn={builtIn} />
      </button>
    </li>
  );
}
