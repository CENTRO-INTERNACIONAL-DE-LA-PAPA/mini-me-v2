import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { AssetRef } from "../protocol/types";
import { formatSize } from "./format";
import { Badge } from "@/components/ui/badge";

/** Media types the core reads for a thumbnail, as every webview the app runs in draws them. */
const THUMBNAIL_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** The files attached to the message being written: images as thumbnails with their name,
 * other files as their name and size, each with a button that removes it. */
export function AttachmentTray({
  projectId,
  attachments,
  onRemove,
}: {
  projectId: string;
  attachments: AssetRef[];
  onRemove: (asset: AssetRef) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul aria-label="Attachments" className="flex flex-wrap items-end gap-2 px-3 pt-3">
      {attachments.map((asset) => (
        <li key={asset.id}>
          {THUMBNAIL_TYPES.includes(asset.media_type) ? (
            <ImageAttachment projectId={projectId} asset={asset} onRemove={onRemove} />
          ) : (
            <Badge variant="secondary">
              {asset.name} · {formatSize(asset.size_bytes)}
              <RemoveButton asset={asset} onRemove={onRemove} />
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImageAttachment({
  projectId,
  asset,
  onRemove,
}: {
  projectId: string;
  asset: AssetRef;
  onRemove: (asset: AssetRef) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    api
      .readImageAsset(projectId, asset.id)
      .then((bytes) => {
        if (!active) return;
        created = URL.createObjectURL(new Blob([bytes], { type: asset.media_type }));
        setUrl(created);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [projectId, asset.id, asset.media_type]);

  return (
    <figure className="relative w-20">
      <div className="size-20 overflow-hidden rounded-lg border border-border bg-muted">
        {url && <img src={url} alt={asset.name} className="size-full object-cover" />}
      </div>
      <figcaption className="mt-1 truncate text-meta text-muted-foreground" title={asset.name}>
        {asset.name}
      </figcaption>
      <span className="absolute -top-1.5 -right-1.5 flex rounded-full border border-border bg-card">
        <RemoveButton asset={asset} onRemove={onRemove} />
      </span>
    </figure>
  );
}

function RemoveButton({
  asset,
  onRemove,
}: {
  asset: AssetRef;
  onRemove: (asset: AssetRef) => void;
}) {
  return (
    <button
      type="button"
      className="flex cursor-pointer p-0.5 text-muted-foreground hover:text-foreground"
      aria-label={`Remove ${asset.name}`}
      title={`Remove ${asset.name}`}
      onClick={() => onRemove(asset)}
    >
      <XIcon aria-hidden className="size-3.5" />
    </button>
  );
}
