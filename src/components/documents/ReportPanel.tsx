import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePlusIcon, FileTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import { formatRelative } from "../../lib/format";
import type { FileEntry, MiniMe } from "../../protocol/types";
import type { MessageView } from "../../protocol/eventStore";
import { FileMark } from "../files/FileMark";
import { isDocument } from "../files/files";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { ToolSheet } from "../shell/Sheet";

/** The Mini-Mes that replied in `messages`, in the order they first replied. */
export function draftSources(messages: MessageView[], miniMes: MiniMe[]): MiniMe[] {
  const ids: string[] = [];
  for (const message of messages) {
    if (message.author.kind === "mini_me" && !ids.includes(message.author.id)) {
      ids.push(message.author.id);
    }
  }
  return ids.flatMap((id) => miniMes.filter((m) => m.id === id));
}

/** The Project's documents, most recently edited first. */
export function documentsOf(files: FileEntry[]): FileEntry[] {
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
        <Card render={<section />} className="gap-3 p-4">
          <div className="flex items-start gap-3">
            <h3 className="flex-1 font-serif text-name text-foreground">
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
              disabled={busy || replying || sources.length === 0}
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
          render={<button type="button" disabled={busy} onClick={() => run(onStartBlank)} />}
          className="flex-row items-center gap-3 p-4 text-left transition-colors duration-150 ease-out hover:bg-well-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          <FilePlusIcon aria-hidden className="size-4 shrink-0" />
          <span className="grid">
            <span className="font-serif text-name text-foreground">Start blank</span>
            <span className="text-meta text-muted-foreground">An empty document in Files</span>
          </span>
        </Card>
        {error && <p className="text-meta text-destructive">{error}</p>}
      </div>
      <h3 className="mt-6 mb-2.5 font-serif text-section text-foreground">Open from Files</h3>
      {documents.length === 0 ? (
        <p className="text-meta text-muted-foreground">No documents in this Project yet.</p>
      ) : (
        <ul className="grid gap-1">
          {documents.map((file) => {
            const maker =
              file.added_by?.kind === "mini_me"
                ? miniMes.find((m) => m.id === file.added_by?.id)
                : undefined;
            return (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => onOpen(file.id)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors duration-150 ease-out hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <FileMark miniMe={maker} icon={FileTextIcon} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-ui font-medium text-foreground">
                      {file.name.replace(/\.qmd$/i, "")}
                    </span>
                    <span className="text-meta text-muted-foreground">
                      {formatRelative(file.modified_at ?? file.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ToolSheet>
  );
}
