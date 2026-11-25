import { Hint } from "../shell/Hint";
import { ListRow } from "../shell/ListRow";
import { Empty, EmptyDescription } from "@/components/ui/empty";
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
import { useOpenFile } from "../documents/openDocument";
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
import { ErrorText } from "../shell/ErrorText";

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
  const open = useOpenFile(project.id, { openDocument: onOpenDocument });
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
    return error ? <ErrorText className="px-8 pt-6">{error}</ErrorText> : null;
  }

  const miniMeOf = (id: string) => miniMes.find((m) => m.id === id);
  const featured = overview.featured;
  const featuredBy = featured ? miniMeOf(featured.author.id) : undefined;
  const shown = shownOutputs(overview.outputs, all);
  const openFile = (id: string, name: string) => open(id, isDocument(name));

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
          <Card aria-label="Summary" className="gap-3">
            <h2 className="font-serif text-heading text-foreground">Where things stand</h2>
            {overview.summary ? (
              <p className="text-body whitespace-pre-line text-document-ink">
                {summaryParts(overview.summary).map((part, index) => {
                  const file = part.named ? findNamed(part.text, files) : undefined;
                  return (
                    <SummaryPart
                      key={index}
                      text={part.text}
                      file={file}
                      miniMes={miniMes}
                      onOpenFile={openFile}
                    />
                  );
                })}
              </p>
            ) : (
              <p className="text-body text-muted-foreground">
                No summary yet. Mini-Me can write one from this Project's Conversations.
              </p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <Hint
                label="Sends the text of this Project's messages, not its files, to the AI model chosen in Settings."
                disabled
              >
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={writing || overview.conversations === 0}
                  onClick={updateSummary}
                >
                  <RefreshCwIcon className={cn(writing && "animate-spin")} />
                  {writing ? "Writing summary…" : "Update summary"}
                </Button>
              </Hint>
              {overview.summary_at !== null && !writing && (
                <span className="text-meta text-muted-foreground">
                  Written {relativeInSentence(overview.summary_at)}
                </span>
              )}
            </div>
            {error && <ErrorText>{error}</ErrorText>}
          </Card>

          {featured && (
            <SheetSection
              title="Featured"
              actions={
                <span className="flex items-center gap-2">
                  <MiniMePill miniMe={featuredBy}>{featuredBy?.name ?? "Mini-Me"}</MiniMePill>
                  <Hint label="Remove from Overview">
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Remove from Overview"
                      onClick={unfeature}
                    >
                      <XIcon />
                    </Button>
                  </Hint>
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
            <Empty>
              <EmptyDescription>
                Tables, charts, papers and files that Mini-Mes make in this Project will appear
                here.
              </EmptyDescription>
            </Empty>
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
                      onOpen={() => openFile(output.id, output.title)}
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
    <ListRow
      leading={<FileMark miniMe={miniMe} icon={Icon} />}
      name={output.title}
      meta={`From ${output.conversation_title}`}
      onOpen={onOpen}
    />
  );
}

/** A piece of the summary: the same `#` chip as in messages for a name of a file of the
 * Project, else plain text, such as a name of one deleted since. */
function SummaryPart({
  text,
  file,
  miniMes,
  onOpenFile,
}: {
  text: string;
  file?: AssetRef;
  miniMes: MiniMe[];
  onOpenFile: (id: string, name: string) => void;
}) {
  if (!file) return <>{text}</>;
  const label = `#${text.replace(/^#/, "")}`;
  return (
    <TextComponentChip
      component={{ kind: "asset", id: file.id, label, start: 0, end: 0 }}
      miniMes={miniMes}
      onOpenAsset={() => onOpenFile(file.id, file.name)}
    >
      {label}
    </TextComponentChip>
  );
}
