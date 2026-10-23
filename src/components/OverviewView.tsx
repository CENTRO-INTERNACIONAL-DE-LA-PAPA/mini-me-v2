import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  ChartColumnIcon,
  FileIcon,
  LightbulbIcon,
  RefreshCwIcon,
  Table2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { MiniMe, Overview, OverviewOutput, ProjectSummary } from "../protocol/types";
import { InteractiveComponent } from "./interactive/InteractiveComponent";
import { MiniMePill } from "./MiniMePill";
import { headerLine, relativeInSentence, shownOutputs } from "./overview";
import { useMiniMes } from "./useMiniMes";

interface Props {
  project: ProjectSummary;
  onOpenConversation: (conversationId: string, messageId: string) => void;
  onOpenFiles: () => void;
}

const KINDS: Record<string, { label: string; icon: typeof FileIcon }> = {
  chart: { label: "Chart", icon: ChartColumnIcon },
  table: { label: "Table", icon: Table2Icon },
  "paper-sources": { label: "Papers", icon: BookOpenIcon },
  theories: { label: "Theories", icon: LightbulbIcon },
  file: { label: "File", icon: FileIcon },
};

const kindOf = (kind: string) =>
  KINDS[kind] ?? { label: kind[0].toUpperCase() + kind.slice(1), icon: FileIcon };

/** The Project Overview: where the Project stands and what its Conversations produced. */
export function OverviewView({ project, onOpenConversation, onOpenFiles }: Props) {
  const miniMes = useMiniMes();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [writing, setWriting] = useState(false);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.getOverview(project.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function updateSummary() {
    setWriting(true);
    setError(null);
    try {
      setOverview(await api.updateOverviewSummary(project.id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWriting(false);
    }
  }

  async function unfeature() {
    try {
      await api.featureComponent(project.id, null);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!overview) {
    return error ? <p className="px-8 pt-14 text-meta text-destructive">{error}</p> : null;
  }

  const miniMeOf = (id: string) => miniMes.find((m) => m.id === id);
  const featured = overview.featured;
  const featuredBy = featured ? miniMeOf(featured.author.id) : undefined;
  const shown = shownOutputs(overview.outputs, all);

  return (
    <div className="mx-auto w-full max-w-[820px] px-8 pt-14 pb-16">
      <p className="text-meta text-muted-foreground">{headerLine(overview)}</p>
      <h1 className="mt-1.5 text-display font-bold">{project.name}</h1>

      <section aria-label="Summary" className="mt-6">
        {overview.summary ? (
          <p className="max-w-[680px] text-body whitespace-pre-line text-ink-2">{overview.summary}</p>
        ) : (
          <p className="text-body text-muted-foreground">
            No summary yet. Mini-Me can write one from this Project's Conversations.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={writing || overview.conversations === 0}
            title="Sends the text of this Project's messages, not its files, to the AI model chosen in Settings."
            onClick={updateSummary}
          >
            <RefreshCwIcon className={cn(writing && "animate-spin")} />
            {writing ? "Writing summary…" : "Update summary"}
          </Button>
          {overview.summary_at !== null && !writing && (
            <span className="text-meta text-muted-foreground">
              Written {relativeInSentence(overview.summary_at)}
            </span>
          )}
        </div>
        {error && <p className="mt-2 text-meta text-destructive">{error}</p>}
      </section>

      {featured && (
        <section aria-label="Featured output" className="mt-10">
          <header className="mb-3 flex items-center gap-3">
            <h2 className="flex-1 text-section font-bold">Featured</h2>
            <MiniMePill miniMe={featuredBy}>{featuredBy?.name ?? "Mini-Me"}</MiniMePill>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove from Overview"
              title="Remove from Overview"
              onClick={unfeature}
            >
              <XIcon />
            </Button>
          </header>
          <InteractiveComponent
            component={featured.component}
            projectId={project.id}
            messageId={featured.message_id}
            replyStatus="complete"
            color={featuredBy?.colors.solid}
          />
        </section>
      )}

      <section aria-label="Latest outputs" className="mt-10">
        <header className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-section font-bold">Latest outputs</h2>
          <Button variant="link" className="text-meta text-muted-foreground" onClick={onOpenFiles}>
            Open Files →
          </Button>
        </header>
        {shown.length === 0 ? (
          <p className="text-muted-foreground">
            Tables, charts, papers and files that Mini-Mes make in this Project will appear here.
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {shown.map((output) => (
              <li key={`${output.kind}-${output.id}`}>
                <OutputCard
                  output={output}
                  miniMe={miniMeOf(output.author.id)}
                  onOpen={() => onOpenConversation(output.conversation_id, output.message_id)}
                />
              </li>
            ))}
          </ul>
        )}
        {!all && overview.outputs.length > shown.length && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAll(true)}>
            Show all {overview.outputs.length}
          </Button>
        )}
      </section>
    </div>
  );
}

/** An output as a card: a thumbnail tinted in the colour of the Mini-Me that made it, then its
 * title and where it came from. */
function OutputCard({
  output,
  miniMe,
  onOpen,
}: {
  output: OverviewOutput;
  miniMe?: MiniMe;
  onOpen: () => void;
}) {
  const { label, icon: Icon } = kindOf(output.kind);
  return (
    <button type="button" onClick={onOpen} className="group/output block h-full w-full text-left">
      <Card
        size="sm"
        className="h-full gap-0 py-0 transition-colors duration-150 group-hover/output:border-border-strong"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-[72px] items-center justify-center border-b-[3px]",
            !miniMe && "border-border-strong bg-muted text-ink-2",
          )}
          style={
            miniMe && {
              backgroundColor: miniMe.colors.tint,
              borderBottomColor: miniMe.colors.solid,
              color: miniMe.colors.ink,
            }
          }
        >
          <Icon className="size-7" />
        </span>
        <span className="grid gap-0.5 px-3 py-2.5">
          <span className="truncate font-medium">{output.title}</span>
          <span className="truncate text-meta text-muted-foreground">
            {label} · {output.conversation_title}
          </span>
        </span>
      </Card>
    </button>
  );
}
