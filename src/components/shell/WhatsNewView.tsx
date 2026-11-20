import { SheetPage } from "./Sheet";
import { Button } from "@/components/ui/button";
import { changelog } from "../../lib/changelog";
import { Markdown } from "../chat/Markdown";

/** This build's changes, from its bundled changelog; shown once after an update, and from
 * Settings → About. */
export function WhatsNewView({ onClose }: { onClose: () => void }) {
  return (
    <SheetPage
      title="What's new"
      description={changelog.version && `Mini-Me ${changelog.version}`}
      actions={<Button onClick={onClose}>Close</Button>}
      className="mx-auto max-w-[760px]"
    >
      <Markdown content={changelog.body} />
    </SheetPage>
  );
}
