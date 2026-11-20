import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Renderers } from "./catalogue";
import { webUrl } from "./links";
import { ResultCard } from "./ResultCard";

/** A paper in `paper-sources` version 1 preview, `{ papers }`, as *Find Papers* builds it. */
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
  const year = paper.year ? ` (${paper.year})` : "";
  return [names, paper.venue].filter(Boolean).join(", ") + year;
}

function PaperSources({ preview }: { preview: unknown }) {
  const { papers } = preview as { papers: Paper[] };
  const [all, setAll] = useState(false);
  const shown = all ? papers : papers.slice(0, SHOWN_SOURCES);
  return (
    <section aria-label="Sources" className="flex flex-col gap-2">
      {shown.map((paper, index) => (
        <ResultCard
          key={index}
          title={paper.title}
          url={webUrl(paper.url)}
          byline={byline(paper)}
          description={paper.reason}
        />
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
