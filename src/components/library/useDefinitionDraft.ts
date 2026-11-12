import { useState } from "react";
import { api, errorMessage } from "../../api";
import { useLoad } from "../../hooks/useLoad";
import type { LibraryView, SavedDefinition } from "../../protocol/types";
import { copyName, NIL_ID } from "./library";

/** The draft starts as the saved item `id`, else a copy of `from` under a free name, else `empty`. */
export function useDefinitionDraft<D extends { id: string; name: string }>({
  id,
  from,
  open,
  source,
  names,
  empty,
  save,
  remove,
  onSaved,
  onRemoved,
}: {
  id?: string;
  from?: string;
  /** The saved item `id` names; throws when there is none. */
  open: (id: string, library: LibraryView) => D | Promise<D>;
  /** The item a copy starts from, or undefined to start from `empty`. */
  source: (from: string, library: LibraryView) => D | undefined | Promise<D | undefined>;
  /** The names a copy's name must not take. */
  names: (library: LibraryView) => string[];
  empty: D;
  save: (draft: D) => Promise<SavedDefinition>;
  remove: (id: string) => Promise<unknown>;
  onSaved: (id: string) => void;
  onRemoved: () => void;
}) {
  const { value, setValue, error } = useLoad(async () => {
    const library = await api.listLibrary();
    let draft = empty;
    if (id) {
      draft = await open(id, library);
    } else if (from) {
      const copied = await source(from, library);
      if (copied) draft = { ...copied, id: NIL_ID, name: copyName(copied.name, names(library)) };
    }
    return { library, draft };
  }, [id, from]);
  const [problems, setProblems] = useState<string | null>(null);

  const library = value?.library ?? null;
  const draft = value?.draft ?? null;

  async function attempt(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      setProblems(errorMessage(e));
    }
  }

  return {
    library,
    draft,
    setDraft: (next: D) => setValue((loaded) => loaded && { ...loaded, draft: next }),
    problems: problems ?? error,
    save: () =>
      attempt(async () => {
        const result = await save(draft!);
        setProblems(null);
        setValue((loaded) => loaded && { ...loaded, library: result.library });
        onSaved(result.id);
      }),
    remove: () =>
      attempt(async () => {
        await remove(draft!.id);
        onRemoved();
      }),
  };
}
