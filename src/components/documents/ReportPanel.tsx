import { ListRow } from "../shell/ListRow";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePlusIcon, FileTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import { useQuarto } from "../../hooks/useQuarto";
import { formatRelative } from "../../lib/format";
import type { FileEntry, MiniMe } from "../../protocol/types";
import type { MessageView } from "../../protocol/eventStore";
import { FileMark } from "../files/FileMark";
import { isDocument } from "../files/files";
import { openLink } from "../interactive/links";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { ToolSheet, ToolSheetGroup } from "../shell/Sheet";
import { documentsBlocked, quartoNotice } from "./quarto";
import { ErrorText } from "../shell/ErrorText";

/** The Mini-Mes that replied in `messages`, in the order they first replied. */
function draftSources(messages: MessageView[], miniMes: MiniMe[]): MiniMe[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (message.author.kind === "mini_me" && !ids.includes(message.author.id)) {
      ids.push(message.author.id);
    }
  }
  return ids.flatMap((id) => miniMes.filter((m) => m.id === id));
}

/** The Project's documents, most recently edited first. */
function documentsOf(files: FileEntry[]): FileEntry[] {
  return files
    .filter((file) => isDocument(file.name))
    .sort((a, b) => (b.modified_at ?? b.created_at) - (a.modified_at ?? a.created_at));
}

/** The Report panel of a Conversation: drafting a document from it, starting a blank one, or
 * opening one of the Project's documents. */
export function ReportPanel({
  projectId,
  messages,
  replying,
  onDraft,
  onStartBlank,
  onOpen,
  onClose,
}: {
  projectId: string;
  messages: MessageView[];
  /** A reply is running, so the Conversation is not finished enough to draft from. */
  replying: boolean;
  onDraft: () => Promise<void>;
  onStartBlank: () => Promise<void>;
  onOpen: (assetId: string) => void;
  onClose: () => void;
}) {
  const miniMes = useMiniMes();
  const [documents, setDocuments] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sources = draftSources(messages, miniMes);
  const quarto = useQuarto();
  const blocked = documentsBlocked(quarto);

  useEffect(() => {
    let active = true;
    api
      .listProjectFiles(projectId)
      .then((files) => active && setDocuments(documentsOf(files)))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [projectId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <ToolSheet title="Report" meta="Choose how to start" onClose={onClose}>
      <div className="grid gap-3">
        <Card render={<section />} size="sm" className="gap-3">
          <div className="flex items-start gap-3">
            <h3 className="flex-1 text-ui font-medium text-foreground">
              Draft from this conversation
            </h3>
            {sources.length > 0 && (
              <span className="flex -space-x-1.5">
                {sources.slice(0, 4).map((miniMe) => (
                  <MiniMeAvatar key={miniMe.id} miniMe={miniMe} size={22} />
                ))}
              </span>
            )}
          </div>
          <p className="text-ui text-ink-2">
            Scribe turns the replies so far into a report with sections, noting which Mini-Me
            found what. You can edit it as it fills in.
          </p>
          <span>
            <Button
              disabled={busy || replying || sources.length === 0 || blocked}
              onClick={() => run(onDraft)}
            >
              Draft report
            </Button>
          </span>
          {sources.length === 0 && (
            <p className="text-meta text-muted-foreground">
              A Mini-Me has to reply here before there is anything to draft from.
            </p>
          )}
        </Card>
        <Card
          render={
            <button type="button" disabled={busy || blocked} onClick={() => run(onStartBlank)} />
          }
          size="sm"
          className="flex-row items-center gap-3 text-left transition-colors duration-150 ease-out hover:bg-well-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
        >
          <FilePlusIcon aria-hidden className="size-4 shrink-0" />
          <span className="grid">
            <span className="text-ui font-medium text-foreground">Start blank</span>
            <span className="text-meta text-muted-foreground">An empty document in Files</span>
          </span>
        </Card>
        {blocked && quarto && (
          <p className="text-meta text-muted-foreground">
            {quartoNotice(quarto)}{" "}
            <Button
              variant="link"
              className="text-meta text-muted-foreground underline"
              onClick={() => openLink(quarto.install_url)}
            >
              Get Quarto
            </Button>
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
      <ToolSheetGroup label="Open from Files">
        {documents.length === 0 ? (
          <Empty>
            <EmptyDescription>No documents in this Project yet.</EmptyDescription>
          </Empty>
        ) : (
          <ul className="grid gap-1">
            {documents.map((file) => {
              const maker =
                file.added_by?.kind === "mini_me"
                  ? miniMes.find((m) => m.id === file.added_by?.id)
                  : undefined;
              return (
                <li key={file.id}>
                  <ListRow
                    leading={<FileMark miniMe={maker} icon={FileTextIcon} />}
                    name={file.name.replace(/\.qmd$/i, "")}
                    meta={formatRelative(file.modified_at ?? file.created_at)}
                    onOpen={() => onOpen(file.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </ToolSheetGroup>
    </ToolSheet>
  );
}
