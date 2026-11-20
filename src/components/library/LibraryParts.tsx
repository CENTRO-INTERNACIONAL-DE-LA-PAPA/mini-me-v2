import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { MiniMe } from "../../protocol/types";
import { count } from "../../lib/format";
import { traitIcon } from "../../lib/traitIcons";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMeSurface } from "../minime/MiniMeSurface";

interface HeaderProps {
  title: string;
  /** What the header shows before the name: a Mini-Me's avatar or a Trait's mark. */
  icon?: ReactNode;
  /** A line under the title, such as a Mini-Me's description. */
  subtitle?: ReactNode;
  /** Where the back link returns to, such as "Mini-Mes". */
  back: string;
  /** Shown on the right before the actions, such as the editor's tab switch. */
  tabs?: ReactNode;
  actions: ReactNode;
  /** Why the last save or delete was refused, one problem per line. */
  problems: string | null;
  onBack: () => void;
}

/** An editor's header: back link, name, actions, and the last save's problems, which scroll
 * within a fixed height so a long list never pushes the editor out of view. */
export function EditorHeader({
  title,
  icon,
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
            className="w-fit gap-1.5 text-control text-muted-foreground"
            onClick={onBack}
          >
            <ChevronLeftIcon />
            {back}
          </Button>
          <div className="flex min-w-0 items-center gap-4">
            {icon && <span className="flex shrink-0 text-foreground">{icon}</span>}
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
  return (
    <Badge variant="outline" className="text-(--mm-ink,var(--ink-2))">
      {builtIn ? "Built-in" : "Yours"}
    </Badge>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border">{children}</ul>;
}

/** A Trait's mark, the same icon its Trait Steps show. */
export function TraitIcon({ icon }: { icon: string | null }) {
  const Icon = traitIcon(icon);
  return <Icon aria-hidden className="size-5 shrink-0 text-ink-2" strokeWidth={1.6} />;
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

/** A Mini-Me's library card: in its own wash when built in, neutral when it is yours. */
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
          "flex h-full w-full cursor-pointer flex-col gap-4.5 rounded-2xl p-5 text-left",
          "transition-colors duration-150 ease-out hover:bg-tint",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="flex items-start justify-between">
          <MiniMeAvatar miniMe={miniMe} size={56} />
          <OriginBadge builtIn={miniMe.built_in} />
        </span>
        <span className="flex flex-1 flex-col gap-1.5">
          <span className="font-serif text-tool-title font-medium text-foreground">
            {miniMe.name}
          </span>
          <span className="line-clamp-3 text-ui text-pretty text-ink-2">{miniMe.description}</span>
        </span>
        <span className="flex items-center justify-between text-meta text-mm-ink">
          {count(traitCount, "Trait")}
          <span className="flex items-center gap-1 font-medium">
            Open
            <ArrowRightIcon className="size-3.5" />
          </span>
        </span>
      </MiniMeSurface>
    </li>
  );
}
