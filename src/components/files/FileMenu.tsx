import { api } from "../../api";
import { ItemMenu } from "../shell/ItemMenu";

/** A file's name split at its last dot, so a rename can keep the extension. */
export function splitName(name: string): { stem: string; suffix: string } {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { stem: name.slice(0, dot), suffix: name.slice(dot) } : { stem: name, suffix: "" };
}

/** The "…" menu of a file wherever a file row appears: Open, Show in folder, Duplicate, Rename
 * (which keeps the extension) and Delete. `onChanged` runs after a rename, copy or delete, so the
 * list around it can reload. */
export function FileMenu({
  projectId,
  file,
  onOpen,
  onChanged,
  className,
}: {
  projectId: string;
  file: { id: string; name: string };
  onOpen: () => void;
  onChanged: () => void;
  className?: string;
}) {
  const { stem, suffix } = splitName(file.name);
  const then = (work: Promise<unknown>) => work.then(onChanged);
  return (
    <ItemMenu
      name={file.name}
      className={className}
      actions={[
        { label: "Open", onSelect: onOpen },
        { label: "Show in folder", onSelect: () => api.revealAsset(projectId, file.id) },
        { label: "Duplicate", onSelect: () => then(api.duplicateAsset(projectId, file.id)) },
      ]}
      rename={{
        current: stem,
        suffix,
        onRename: (typed) => then(api.renameAsset(projectId, file.id, typed)),
      }}
      remove={{
        question: `Delete ${file.name}? It is removed from the Project's folder. This can't be undone.`,
        onDelete: () => then(api.deleteAsset(projectId, file.id)),
      }}
    />
  );
}
