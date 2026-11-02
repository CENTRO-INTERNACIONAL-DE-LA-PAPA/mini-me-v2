import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../../api";

const ExistingFiles = createContext<ReadonlySet<string> | null>(null);

/** Tells the chips inside which of the Project's files still exist. The list is read again when
 * `refreshKey` changes, such as when a message arrives. */
export function ExistingFilesProvider({
  projectId,
  refreshKey,
  children,
}: {
  projectId: string;
  refreshKey: unknown;
  children: ReactNode;
}) {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let current = true;
    api
      .listProjectFiles(projectId)
      .then((files) => current && setIds(new Set(files.map((f) => f.id))))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [projectId, refreshKey]);
  return <ExistingFiles.Provider value={ids}>{children}</ExistingFiles.Provider>;
}

/** Whether the file `id` still exists. True until the Project's files are known, and for `null`,
 * which is not a file. */
export function useFileExists(id: string | null): boolean {
  const ids = useContext(ExistingFiles);
  return id === null || ids === null || ids.has(id);
}
