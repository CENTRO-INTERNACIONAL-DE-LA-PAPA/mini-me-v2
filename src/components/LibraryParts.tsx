import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PuzzleIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { MiniMe } from "../protocol/types";
import { surfaceStyle } from "./miniMeColors";
import { MiniMeAvatar } from "./MiniMeAvatar";
import { MiniMeSurface } from "./MiniMeSurface";

interface HeaderProps {
  title: string;
  /** What the identity tile shows: a Mini-Me's avatar or a Trait's mark. */
  icon?: ReactNode;
  /** The Mini-Me whose tint fills the identity tile; neutral without one. */
  miniMe?: MiniMe;
  /** A line under the title, such as a Mini-Me's description. */
  subtitle?: string;
  /** Where the back link returns to, such as "Mini-Mes". */
  back: string;
  /** Shown on the right before the actions, such as the editor's tab switch. */
  tabs?: ReactNode;
  actions: ReactNode;
  /** Why the last save or delete was refused, one problem per line. */
  problems: string | null;
  onBack: () => void;
}

/** An editor's identity header: a back link, the identity tile with the serif name and a line
 * under it, and the tab switch and actions on the right; then the problems with the last
 * save. The problems scroll within a fixed height, so a long list never pushes the rest of
 * the editor out of view. */
export function EditorHeader({
  title,
  icon,
  miniMe,
  subtitle,
  back,
  tabs,
  actions,
  problems,
  onBack,
}: HeaderProps) {
  return (
    <div className="flex flex-col gap-4 pt-6 pr-6 pl-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Button
            variant="link"
            className="w-fit gap-1.5 text-control font-normal text-muted-foreground"
            onClick={onBack}
          >
            <ChevronLeftIcon />
            {back}
          </Button>
          <div className="flex min-w-0 items-center gap-4">
            {icon && (
              <span
                style={surfaceStyle(miniMe?.colors)}
                className="flex size-16 shrink-0 items-center justify-center rounded-sheet bg-tint text-foreground"
              >
                {icon}
              </span>
            )}
            <div className="grid min-w-0 gap-1">
              <h1 className="truncate font-serif text-identity font-medium text-foreground">
                {title}
              </h1>
              {subtitle && <p className="truncate text-ui text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tabs}
          {actions}
        </div>
      </header>
      {problems && (
        <Card
          render={<ul />}
          className="max-h-32 gap-1 overflow-y-auto rounded-xl px-4 py-3 text-meta text-destructive"
        >
          {problems.split("\n").map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </Card>
      )}
    </div>
  );
}

/** An editor page that only has its header, such as one that could not load. */
export function EditorPage({ children, ...header }: HeaderProps & { children: ReactNode }) {
  return (
    <main className="flex w-full flex-col gap-6 pb-10">
      <EditorHeader {...header} />
      <div className="grid gap-6 px-8">{children}</div>
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

/** Flat rows on the sheet, divided by hairlines. */
export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border">{children}</ul>;
}

/** A Trait's mark: a puzzle piece on a tile, the same piece a Trait Step shows. */
export function TraitIcon({ size = 42 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-well border border-border bg-muted"
      style={{ width: size, height: size }}
    >
      <PuzzleIcon className="size-[18px]" strokeWidth={1.6} />
    </span>
  );
}

/** One Mini-Me or Trait in a list, opening its editor. */
export function Row({
  icon,
  name,
  description,
  details,
  onOpen,
}: {
  icon?: ReactNode;
  name: string;
  description: string;
  /** What is shown between the description and the arrow, such as the Mini-Mes using a Trait. */
  details?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left transition-colors duration-150 ease-out outline-none hover:bg-accent focus-visible:bg-accent"
        onClick={onOpen}
      >
        {icon}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-ui font-medium">{name}</span>
          <span className="truncate text-meta text-muted-foreground">{description}</span>
        </span>
        {details}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-chev" />
      </button>
    </li>
  );
}

/** A Mini-Me as a library card: in its own wash when built in, neutral when it is yours, with
 * its avatar, name, description and Trait count, opening its editor. */
export function MiniMeCard({
  miniMe,
  traitCount,
  onOpen,
}: {
  miniMe: MiniMe;
  traitCount: number;
  onOpen: () => void;
}) {
  const coloured = miniMe.built_in ? miniMe : undefined;
  return (
    <li>
      <MiniMeSurface
        miniMe={coloured}
        render={<button type="button" onClick={onOpen} />}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col gap-[18px] rounded-sheet p-5 text-left",
          "transition-colors duration-150 ease-out hover:bg-tint",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="flex items-start justify-between">
          <MiniMeAvatar miniMe={miniMe} size={56} />
          <Badge
            variant="outline"
            className="h-auto border-transparent bg-card px-2.5 py-[3px] text-meta text-(--mm-ink,var(--ink-2)) border border-edge"
          >
            {miniMe.built_in ? "Built-in" : "Yours"}
          </Badge>
        </span>
        <span className="flex flex-1 flex-col gap-1.5">
          <span className="font-serif text-card-title font-medium text-foreground">
            {miniMe.name}
          </span>
          <span className="line-clamp-3 text-ui text-pretty text-ink-2">{miniMe.description}</span>
        </span>
        <span className="flex items-center justify-between text-meta text-mm-ink">
          {traitCount === 1 ? "1 Trait" : `${traitCount} Traits`}
          <span className="flex items-center gap-1 font-medium">
            Open
            <ArrowRightIcon className="size-3.5" />
          </span>
        </span>
      </MiniMeSurface>
    </li>
  );
}
