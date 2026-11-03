import { useSidebar } from "@/components/ui/sidebar";
import { useEffect, useRef } from "react";

/** Below this window width, a tool sheet beside the full navigation sheet leaves the Conversation
 * under 600px. */
const SMALL_WINDOW = 1280;

/** Collapses the navigation sheet while the calling component is mounted in a window narrower
 * than `SMALL_WINDOW`, and opens it again afterwards unless the user opened it in the meantime. */
export function useCollapseSidebar() {
  const { open, setOpen } = useSidebar();
  // `setOpen` changes whenever `open` does, so the effect reads both through refs: depending on
  // them would run its cleanup, and reopen the sidebar, right after it collapsed.
  const current = useRef({ open, setOpen });
  current.current = { open, setOpen };

  useEffect(() => {
    if (window.innerWidth >= SMALL_WINDOW || !current.current.open) return;
    current.current.setOpen(false);
    return () => {
      if (!current.current.open) current.current.setOpen(true);
    };
  }, []);
}
