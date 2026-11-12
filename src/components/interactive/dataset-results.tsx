import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDownIcon, ChevronRightIcon, DownloadIcon, LockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import { announceFilesChanged } from "../../hooks/useFilesChanged";
import { formatSize } from "../../lib/format";
import type { AssetRef, Dataset, DatasetFile, DataverseSearch } from "../../protocol/types";
import { ReferenceChip } from "../chat/ReferenceChip";
import { useOpenDocument } from "../documents/openDocument";
import { isDocument } from "../files/files";
import type { Renderers, RendererProps } from "./catalogue";
import { openLink, webUrl } from "./links";

/** `dataset-results` version 1 data from *Search CIP Dataverse*; `datasets` is the first page. */
interface DatasetResultsData {
  query: string;
  from_year: number | null;
  to_year: number | null;
  total: number;
  datasets: Dataset[];
}

/** The authors, three at most, and the year: "Atieno, Elly (2020)". */
export function datasetByline(dataset: Dataset): string {
  const authors = dataset.authors ?? [];
  const names = authors.slice(0, 3).join("; ") + (authors.length > 3 ? " et al." : "");
  const year = dataset.year ? ` (${dataset.year})` : "";
  return (names + year).trim();
}

/** A file of an opened dataset; `error` is why its last download failed. */
type FileState = { file: DatasetFile; error?: string };

function DatasetFiles({ projectId, dataset }: { projectId: string; dataset: Dataset }) {
  const [files, setFiles] = useState<FileState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const openDocument = useOpenDocument();

  useEffect(() => {
    let active = true;
    api
      .dataverseFiles(projectId, dataset.id)
      .then((listed) => active && setFiles(listed.map((file) => ({ file }))))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [projectId, dataset.id]);

  const open = (asset: AssetRef) => {
    if (openDocument && isDocument(asset.name)) openDocument(asset.id);
    else void api.openAsset(projectId, asset.id).catch(() => {});
  };

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

  if (error) return <p className="text-meta text-destructive">{error}</p>;
  if (!files) return <p className="text-meta text-muted-foreground">Loading files…</p>;
  if (files.length === 0) return <p className="text-meta text-muted-foreground">No files.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">
        {files.map(({ file, error }) => (
          <li key={file.id} className="flex flex-col gap-0.5 border-t border-border py-2 first:border-t-0">
            <div className="flex items-center gap-2.5 text-ui">
              {file.asset ? (
                <span className="w-[18px] shrink-0" aria-hidden />
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
                  className="size-[15px] shrink-0 text-muted-foreground"
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
            {error && <p className="pl-7 text-meta text-destructive">{error}</p>}
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
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
    <article className="flex flex-col gap-1 rounded-xl border border-card-edge bg-card px-4 py-3">
      {url ? (
        <button
          type="button"
          title={url}
          className="line-clamp-2 cursor-pointer text-left text-ui font-semibold text-foreground hover:underline"
          onClick={() => openLink(url)}
        >
          {dataset.title}
        </button>
      ) : (
        <span className="line-clamp-2 text-ui font-semibold text-foreground">{dataset.title}</span>
      )}
      {datasetByline(dataset) && (
        <span className="text-meta text-muted-foreground">{datasetByline(dataset)}</span>
      )}
      {dataset.description && (
        <span className="line-clamp-3 text-meta text-ink-2">{dataset.description}</span>
      )}
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
    </article>
  );
}

function DatasetResults({ data, projectId }: RendererProps) {
  const first = data as DatasetResultsData;
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
      {error && <p className="text-meta text-destructive">{error}</p>}
      {datasets.length < first.total && (
        <Button variant="outline" className="self-start" disabled={loading} onClick={() => void showMore()}>
          {loading ? "Loading…" : "Show more"}
        </Button>
      )}
    </section>
  );
}

export const renderers: Renderers = {
  1: DatasetResults,
};
