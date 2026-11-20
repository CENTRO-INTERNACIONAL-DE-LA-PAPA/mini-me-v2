import type { ReactNode } from "react";
import { ComponentCard } from "./ComponentCard";
import { openLink } from "./links";

/** A search result: its title, which opens `url` when there is one, a byline, a description,
 * and anything the result adds below. */
export function ResultCard({
  title,
  url,
  byline,
  description,
  children,
}: {
  title: string;
  url?: string | null;
  byline?: string;
  description?: string | null;
  children?: ReactNode;
}) {
  const heading = "line-clamp-2 text-left text-ui font-semibold text-foreground";
  return (
    <ComponentCard render={<article />} className="gap-1">
      {url ? (
        <button
          type="button"
          title={url}
          className={`${heading} cursor-pointer underline-offset-2 hover:underline`}
          onClick={() => openLink(url)}
        >
          {title}
        </button>
      ) : (
        <span className={heading}>{title}</span>
      )}
      {byline && <span className="text-meta text-muted-foreground">{byline}</span>}
      {description && <span className="line-clamp-3 text-meta text-ink-2">{description}</span>}
      {children}
    </ComponentCard>
  );
}
