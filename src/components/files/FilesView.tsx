import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileIcon, FileTextIcon, ImageIcon, SearchIcon, Table2Icon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { useUserProfile } from "../../hooks/useUserProfile";
import { initials } from "../../lib/names";
import type { FileEntry, ProjectSummary } from "../../protocol/types";
import { fileKind, isDocument, type FileKind } from "./files";
import { formatRelative, formatSize } from "../../lib/format";
import { FileTile } from "./FileTile";
import { surfaceStyle } from "../minime/miniMeColors";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { SheetPage } from "../shell/Sheet";
import { useMiniMes } from "../../hooks/useMiniMes";

type Tab = "all" | "data" | "document" | "outputs";

const TABS: { id: Tab; name: string }[] = [
  { id: "all", name: "All files" },
  { id: "data", name: "Data" },
  { id: "document", name: "Documents" },
  { id: "outputs", name: "Mini-Me outputs" },
];

const ICONS: Record<FileKind, typeof FileIcon> = {
  data: Table2Icon,
  document: FileTextIcon,
  image: ImageIcon,
  other: FileIcon,
};

interface Props {
  project: ProjectSummary;
  onOpenConversation: (id: string) => void;
  /** Opens a `.qmd` document in the document view. */
  onOpenDocument: (assetId: string) => void;
  /** Called after files were added, so counts elsewhere can refresh. */
  onChanged: () => void;
}

/** The Project's files: every Asset, who added it, and the Conversations that use it. */
export function FilesView({ project, onOpenConversation, onOpenDocument, onChanged }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEntries(await api.listProjectFiles(project.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload() {
    try {
      const imported = await api.importAssets(project.id);
      if (imported.length > 0) {
        await refresh();
        onChanged();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function open(id: string) {
    try {
      await api.openAsset(project.id, id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const needle = query.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (tab === "all" ||
        (tab === "outputs" ? entry.source === "generated" : fileKind(entry.media_type, entry.name) === tab)) &&
      (!needle || entry.name.toLowerCase().includes(needle)),
  );
  const total = entries.reduce((sum, entry) => sum + entry.size_bytes, 0);

  const made = entries.filter((entry) => entry.source === "generated").length;

  return (
    <SheetPage
      title="Files"
      description={
        <>
          {entries.length} {entries.length === 1 ? "file" : "files"} in {project.name} ·{" "}
          {made} made by Mini-Mes · {formatSize(total)}
        </>
      }
      actions={
        <Button onClick={upload}>
          <UploadIcon />
          Upload
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList aria-label="Show">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search files"
            placeholder="Search files"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-meta text-destructive">{error}</p>}

      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead>Used in</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((entry) => (
              <FileRow
                key={entry.id}
                entry={entry}
                onOpen={() =>
                  isDocument(entry.name) ? onOpenDocument(entry.id) : open(entry.id)
                }
                onOpenConversation={onOpenConversation}
              />
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {entries.length === 0
                    ? "No files yet. Upload one, or attach it to a message."
                    : "No files match."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="flex items-center gap-2 text-meta text-muted-foreground">
        <span aria-hidden className="size-[7px] rounded-full bg-success" />
        Every file here is stored on this computer, in the Project's folder.
      </p>
    </SheetPage>
  );
}

function FileRow({
  entry,
  onOpen,
  onOpenConversation,
}: {
  entry: FileEntry;
  onOpen: () => void;
  onOpenConversation: (id: string) => void;
}) {
  const miniMes = useMiniMes();
  const name = useUserProfile()?.name;
  const Icon = ICONS[fileKind(entry.media_type, entry.name)];
  const by = entry.added_by;
  const miniMe = by?.kind === "mini_me" ? miniMes.find((m) => m.id === by.id) : undefined;

  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="max-w-80">
        <span className="flex items-center gap-3">
          <FileTile miniMe={miniMe} icon={Icon} />
          <span className="truncate font-medium">{entry.name}</span>
        </span>
      </TableCell>
      <TableCell>
        {by?.kind === "user" ? (
          <span className="flex items-center gap-2">
            {name && (
              <span className="flex size-4 items-center justify-center rounded-full border border-border bg-muted text-[7px] font-semibold">
                {initials(name)}
              </span>
            )}
            You
          </span>
        ) : by?.kind === "mini_me" ? (
          <span
            style={surfaceStyle(miniMe?.colors)}
            className="flex items-center gap-[7px] text-(--mm-ink,var(--foreground))"
          >
            <MiniMeAvatar miniMe={miniMe} size={18} />
            {miniMe?.name ?? "Mini-Me"}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {entry.source === "generated" ? "A Mini-Me" : "You"}
          </span>
        )}
      </TableCell>
      <TableCell>
        {entry.used_in.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : entry.used_in.length === 1 ? (
          <button
            className="cursor-pointer truncate hover:opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              onOpenConversation(entry.used_in[0].id);
            }}
          >
            {entry.used_in[0].title}
          </button>
        ) : (
          <span title={entry.used_in.map((c) => c.title).join(", ")}>
            {entry.used_in.length} conversations
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{formatRelative(entry.created_at)}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {formatSize(entry.size_bytes)}
      </TableCell>
    </TableRow>
  );
}
