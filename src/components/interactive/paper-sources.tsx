import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Renderers } from "./catalogue";
import { openLink, webUrl } from "./links";

/** A paper in `paper-sources` version 1 data, `{ papers }`, as *Find Papers* builds it. */
interface Paper {
  title: string;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  url?: string | null;
  reason?: string | null;
}

/** How many sources show before "Show all sources". */
export const SHOWN_SOURCES = 5;

function byline(paper: Paper): string {
  const authors = paper.authors ?? [];
  const names = authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : "");
  return [names, paper.year, paper.venue].filter(Boolean).join(" · ");
}

function SourceCard({ paper }: { paper: Paper }) {
  const url = webUrl(paper.url);
  const body = (
    <>
      <span className="line-clamp-2 text-ui font-semibold text-foreground">{paper.title}</span>
      {byline(paper) && <span className="text-meta text-muted-foreground">{byline(paper)}</span>}
      {paper.reason && <span className="line-clamp-3 text-meta text-ink-2">{paper.reason}</span>}
    </>
  );
  const card = "flex w-full flex-col gap-1 rounded-xl border border-card-edge bg-card px-4 py-3 text-left";
  if (!url) {
    return <div className={card}>{body}</div>;
  }
  return (
    <button
      type="button"
      title={url}
      className={`${card} cursor-pointer transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring`}
      onClick={() => openLink(url)}
    >
      {body}
    </button>
  );
}

function PaperSources({ data }: { data: unknown }) {
  const { papers } = data as { papers: Paper[] };
  const [all, setAll] = useState(false);
  const shown = all ? papers : papers.slice(0, SHOWN_SOURCES);
  return (
    <section aria-label="Sources" className="flex flex-col gap-2">
      {shown.map((paper, index) => (
        <SourceCard key={index} paper={paper} />
      ))}
      {papers.length > SHOWN_SOURCES && (
        <Button variant="outline" className="self-start" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all sources (${papers.length})`}
        </Button>
      )}
    </section>
  );
}

export const renderers: Renderers = {
  1: PaperSources,
};
