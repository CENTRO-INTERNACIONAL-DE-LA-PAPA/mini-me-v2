import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState, type ReactNode } from "react";

/** An editor page: a back link, the title with its mark and actions, problems, then fields. */
export function EditorPage({
  title,
  icon,
  builtIn,
  actions,
  problems,
  onBack,
  children,
}: {
  title: string;
  icon?: ReactNode;
  builtIn: boolean;
  actions: ReactNode;
  /** Why the last save or delete was refused, one problem per line. */
  problems: string | null;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-8 py-10">
      <Button variant="link" className="mb-2 px-0 text-muted-foreground" onClick={onBack}>
        ← Library
      </Button>
      <header className="mb-8 flex items-center gap-4">
        {icon}
        <h1 className="min-w-0 flex-1 truncate text-page font-bold">{title}</h1>
        <OriginBadge builtIn={builtIn} />
        <div className="flex shrink-0 gap-2">{actions}</div>
      </header>
      {problems && (
        <ul className="mb-6 grid gap-1 rounded-lg border border-border bg-card px-4 py-3 text-meta text-destructive">
          {problems.split("\n").map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
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
