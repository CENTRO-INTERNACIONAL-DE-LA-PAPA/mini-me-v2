import { ResultCard } from "./ResultCard";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDownIcon, ChevronRightIcon, DownloadIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "../../api";
import { useLoad } from "../../hooks/useLoad";
import { announceFilesChanged } from "../../hooks/useFilesChanged";
import { formatSize } from "../../lib/format";
import type { AssetRef, Dataset, DatasetFile, DataverseSearch } from "../../protocol/types";
import { ReferenceChip } from "../chat/ReferenceChip";
import { useOpenFile } from "../documents/openDocument";
import { isDocument } from "../files/files";
import type { Renderers, RendererProps } from "./catalogue";
import { webUrl } from "./links";
import { ErrorText } from "../shell/ErrorText";

/** `dataset-results` version 1 preview from *Search CIP Dataverse*; `datasets` is the first page. */
interface DatasetResultsData {
  query: string;
  from_year: number | null;
  to_year: number | null;
  total: number;
  datasets: Dataset[];
}

/** The authors, three at most, and the year: "Atieno, Elly (2020)". */
function datasetByline(dataset: Dataset): string {
  const authors = dataset.authors ?? [];
  const names = authors.slice(0, 3).join("; ") + (authors.length > 3 ? " et al." : "");
  const year = dataset.year ? ` (${dataset.year})` : "";
  return (names + year).trim();
}

/** A file of an opened dataset; `error` is why its last download failed. */
type FileState = { file: DatasetFile; error?: string };

function DatasetFiles({ projectId, dataset }: { projectId: string; dataset: Dataset }) {
  const {
    value: files,
    setValue: setFiles,
    error,
    setError,
  } = useLoad(
    () =>
      api
        .dataverseFiles(projectId, dataset.id)
        .then((listed): FileState[] => listed.map((file) => ({ file }))),
    [projectId, dataset.id],
  );
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const openFile = useOpenFile(projectId);

  const open = (asset: AssetRef) => openFile(asset.id, isDocument(asset.name));

  async function download() {
    if (!files) return;
    setDownloading(true);
    const chosen = files.filter((f) => ticked.has(f.file.id)).map((f) => f.file);
    try {
      const results = await api.dataverseDownload(projectId, dataset, chosen);
      if (results.some((r) => r.asset)) announceFilesChanged(projectId);
      const byId = new Map(results.map((r) => [r.file_id, r]));
      setFiles(
        files.map(({ file, error }) => {
          const result = byId.get(file.id);
          if (!result) return { file, error };
          return result.asset ? { file: { ...file, asset: result.asset } } : { file, error: result.error };
        }),
      );
      setTicked(new Set());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!files) return <p className="text-meta text-muted-foreground">Loading files…</p>;
  if (files.length === 0) {
    return (
      <Empty className="py-4">
        <EmptyDescription>No files.</EmptyDescription>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">
        {files.map(({ file, error }) => (
          <li key={file.id} className="flex flex-col gap-0.5 border-t border-border py-2 first:border-t-0">
            <div className="flex items-center gap-2 text-ui">
              {file.asset ? (
                <span className="w-4.5 shrink-0" aria-hidden />
              ) : (
                <Checkbox
                  aria-label={`Download ${file.name}`}
                  checked={ticked.has(file.id)}
                  disabled={downloading}
                  onCheckedChange={(checked) => {
                    const next = new Set(ticked);
                    if (checked) next.add(file.id);
                    else next.delete(file.id);
                    setTicked(next);
                  }}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground">
                {file.name} <span className="text-muted-foreground">({formatSize(file.size_bytes)})</span>
              </span>
              {file.restricted && !file.asset && (
                <LockIcon
                  aria-label="Restricted"
                  role="img"
                  className="size-4 shrink-0 text-muted-foreground"
                >
                  <title>Restricted: needs access</title>
                </LockIcon>
              )}
              {file.asset && (
                <ReferenceChip title="Open file" onOpen={() => open(file.asset as AssetRef)}>
                  In Files
                </ReferenceChip>
              )}
            </div>
            {error && <ErrorText className="pl-7">{error}</ErrorText>}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="self-start"
        disabled={ticked.size === 0 || downloading}
        onClick={() => void download()}
      >
        <DownloadIcon />
        {downloading ? "Downloading…" : ticked.size > 0 ? `Download (${ticked.size})` : "Download"}
      </Button>
    </div>
  );
}

function DatasetCard({ dataset, projectId }: { dataset: Dataset; projectId?: string }) {
  const [open, setOpen] = useState(false);
  const url = webUrl(dataset.url);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <ResultCard
      title={dataset.title}
      url={url}
      byline={datasetByline(dataset)}
      description={dataset.description}
    >
      {projectId && dataset.files > 0 && (
        <Button
          variant="ghost"
          className="-ml-2 self-start"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Chevron />
          Files ({dataset.files})
        </Button>
      )}
      {projectId && open && <DatasetFiles projectId={projectId} dataset={dataset} />}
    </ResultCard>
  );
}

function DatasetResults({ preview, projectId }: RendererProps) {
  const first = preview as DatasetResultsData;
  const [datasets, setDatasets] = useState<Dataset[]>(first.datasets ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function showMore() {
    setLoading(true);
    setError(null);
    const search: DataverseSearch = {
      query: first.query,
      from_year: first.from_year ?? null,
      to_year: first.to_year ?? null,
      start: datasets.length,
    };
    try {
      const page = await api.dataverseSearch(search);
      setDatasets([...datasets, ...page.datasets]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="Datasets" className="flex flex-col gap-2">
      {datasets.map((dataset) => (
        <DatasetCard key={dataset.id} dataset={dataset} projectId={projectId} />
      ))}
      {error && <ErrorText>{error}</ErrorText>}
      {datasets.length < first.total && (
        <Button variant="secondary" className="self-start" disabled={loading} onClick={() => void showMore()}>
          {loading ? "Loading…" : "Show more"}
        </Button>
      )}
    </section>
  );
}

export const renderers: Renderers = {
  1: DatasetResults,
};
