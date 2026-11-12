import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileIcon,
  LightbulbIcon,
  RefreshCwIcon,
  Table2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import type {
  AssetRef,
  FileEntry,
  MiniMe,
  Overview,
  OverviewOutput,
  ProjectSummary,
} from "../../protocol/types";
import { TextComponentChip } from "../chat/TextComponentChip";
import { InteractiveComponent } from "../interactive/InteractiveComponent";
import { FileMark } from "../files/FileMark";
import { FileMenu } from "../files/FileMenu";
import { DOTS_HOVER } from "../shell/ItemMenu";
import { isDocument } from "../files/files";
import { MiniMePill } from "../minime/MiniMePill";
import { ItemMenu } from "../shell/ItemMenu";
import { SheetPage, SheetSection } from "../shell/Sheet";
import {
  findNamed,
  headerLine,
  relativeInSentence,
  shownOutputs,
  summaryParts,
} from "./overview";
import { useMiniMes } from "../../hooks/useMiniMes";

interface Props {
  project: ProjectSummary;
  onOpenConversation: (conversationId: string, messageId: string) => void;
  onOpenFiles: () => void;
  /** Called after a file was renamed, copied or deleted, so counts elsewhere can refresh. */
  onChanged: () => void;
  onOpenDocument: (assetId: string) => void;
  onRenameProject: (name: string) => Promise<unknown>;
  onDeleteProject: () => Promise<unknown>;
}

const KINDS: Record<string, { label: string; icon: typeof FileIcon }> = {
  chart: { label: "Chart", icon: ChartColumnIcon },
  table: { label: "Table", icon: Table2Icon },
  "paper-sources": { label: "Papers", icon: BookOpenIcon },
  theories: { label: "Theories", icon: LightbulbIcon },
  "dataset-results": { label: "Datasets", icon: DatabaseIcon },
  file: { label: "File", icon: FileIcon },
};

const kindOf = (kind: string) =>
  KINDS[kind] ?? { label: kind[0].toUpperCase() + kind.slice(1), icon: FileIcon };

/** The Project Overview: where the Project stands and what its Conversations produced. */
export function OverviewView({
  project,
  onOpenConversation,
  onOpenFiles,
  onChanged,
  onOpenDocument,
  onRenameProject,
  onDeleteProject,
}: Props) {
  const miniMes = useMiniMes();
  const [overview, setOverview] = useState<Overview | null>(null);
  // The Project's files, which the summary's links may name.
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [writing, setWriting] = useState(false);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(await api.getOverview(project.id));
      setFiles(await api.listProjectFiles(project.id));
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
  const openFile = (id: string, name: string) =>
    isDocument(name) ? onOpenDocument(id) : void api.openAsset(project.id, id).catch(() => {});

  return (
    <SheetPage
      title={project.name}
      titleAction={
        <ItemMenu
          name={project.name}
          rename={{ current: project.name, onRename: onRenameProject }}
          remove={{
            question: `Delete "${project.name}"? Its Conversations and files are removed for good. This can't be undone.`,
            onDelete: onDeleteProject,
          }}
        />
      }
      description={headerLine(overview)}
    >
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-4 max-lg:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Card aria-label="Summary" className="gap-2.5 px-[22px] py-5">
            <h2 className="font-serif text-heading text-foreground">Where things stand</h2>
            {overview.summary ? (
              <p className="text-body whitespace-pre-line text-document-ink">
                {summaryParts(overview.summary).map((part, index) => {
                  const found = part.named && findNamed(part.text, files, overview.outputs);
                  return (
                    <SummaryPart
                      key={index}
                      text={part.text}
                      file={found && "file" in found ? found.file : undefined}
                      component={found && "component" in found ? found.component : undefined}
                      miniMes={miniMes}
                      onOpenFile={openFile}
                      onOpenConversation={onOpenConversation}
                    />
                  );
                })}
              </p>
            ) : (
              <p className="text-body text-muted-foreground">
                No summary yet. Mini-Me can write one from this Project's Conversations.
              </p>
            )}
            <div className="mt-1 flex items-center gap-3">
              <Button
                variant="mini-me"
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
            {error && <p className="text-meta text-destructive">{error}</p>}
          </Card>

          {featured && (
            <SheetSection
              title="Featured"
              actions={
                <span className="flex items-center gap-2">
                  <MiniMePill miniMe={featuredBy}>{featuredBy?.name ?? "Mini-Me"}</MiniMePill>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Remove from Overview"
                    title="Remove from Overview"
                    onClick={unfeature}
                  >
                    <XIcon />
                  </Button>
                </span>
              }
            >
              <InteractiveComponent
                component={featured.component}
                projectId={project.id}
                messageId={featured.message_id}
                replyStatus="complete"
                color={featuredBy?.colors.solid}
              />
            </SheetSection>
          )}
        </div>

        <SheetSection
          title="Latest outputs"
          actions={
            <Button variant="link" className="text-meta text-muted-foreground" onClick={onOpenFiles}>
              Open Files
              <ChevronRightIcon />
            </Button>
          }
        >
          {shown.length === 0 ? (
            <p className="text-muted-foreground">
              Tables, charts, papers and files that Mini-Mes make in this Project will appear here.
            </p>
          ) : (
            <ul className="grid gap-0.5">
              {shown.map((output) => (
                <li key={`${output.kind}-${output.id}`} className="group/output relative">
                  <OutputRow
                    output={output}
                    miniMe={miniMeOf(output.author.id)}
                    onOpen={() => onOpenConversation(output.conversation_id, output.message_id)}
                  />
                  {output.kind === "file" && (
                    <FileMenu
                      projectId={project.id}
                      file={{ id: output.id, name: output.title }}
                      className={cn(
                        "absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-focus-within/output:opacity-100 group-hover/output:opacity-100 aria-expanded:opacity-100",
                        DOTS_HOVER,
                      )}
                      onOpen={() =>
                        isDocument(output.title)
                          ? onOpenDocument(output.id)
                          : api.openAsset(project.id, output.id)
                      }
                      onChanged={() => {
                        void refresh();
                        onChanged();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {!all && overview.outputs.length > shown.length && (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => setAll(true)}>
              Show all {overview.outputs.length}
            </Button>
          )}
        </SheetSection>
      </div>
    </SheetPage>
  );
}

/** An output's row: its icon in its maker's ink, its title, and the Conversation it came from. */
function OutputRow({
  output,
  miniMe,
  onOpen,
}: {
  output: OverviewOutput;
  miniMe?: MiniMe;
  onOpen: () => void;
}) {
  const { icon: Icon } = kindOf(output.kind);
  return (
    <Button
      variant="ghost"
      onClick={onOpen}
      className="h-auto w-full justify-start gap-2.5 rounded-xl px-1.5 py-2 text-left font-normal text-foreground"
    >
      <FileMark miniMe={miniMe} icon={Icon} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-ui">{output.title}</span>
        <span className="truncate text-meta text-muted-foreground">
          From {output.conversation_title}
        </span>
      </span>
    </Button>
  );
}

/** A piece of the summary: the same `#` or `$` chip as in messages for a name of a file, table
 * or chart of the Project, else plain text, such as a name of one deleted since. */
function SummaryPart({
  text,
  file,
  component,
  miniMes,
  onOpenFile,
  onOpenConversation,
}: {
  text: string;
  file?: AssetRef;
  component?: OverviewOutput;
  miniMes: MiniMe[];
  onOpenFile: (id: string, name: string) => void;
  onOpenConversation: (conversationId: string, messageId: string) => void;
}) {
  const target = file ?? component;
  if (!target) return <>{text}</>;
  const label = `${file ? "#" : "$"}${text.replace(/^[#$]/, "")}`;
  return (
    <TextComponentChip
      component={{ kind: file ? "asset" : "component", id: target.id, label, start: 0, end: 0 }}
      miniMes={miniMes}
      onOpenAsset={file && (() => onOpenFile(file.id, file.name))}
      onOpenComponent={
        component && (() => onOpenConversation(component.conversation_id, component.message_id))
      }
      componentKind={component?.kind === "chart" ? "chart" : "table"}
    >
      {label}
    </TextComponentChip>
  );
}
