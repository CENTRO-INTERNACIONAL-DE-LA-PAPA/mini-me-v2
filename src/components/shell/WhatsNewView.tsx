import { Button } from "@/components/ui/button";
import { changelog } from "../../lib/changelog";
import { Markdown } from "../chat/Markdown";

/** This build's changes, from its bundled changelog; shown once after an update, and from
 * Settings → About. */
export function WhatsNewView({ onClose }: { onClose: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-10 py-9">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="grid gap-1.5">
          <h1 className="font-serif text-sheet-title font-medium text-foreground">What's new</h1>
          {changelog.version && (
            <p className="text-ui text-muted-foreground">Mini-Me {changelog.version}</p>
          )}
        </div>
        <Button onClick={onClose}>Close</Button>
      </header>
      <Markdown content={changelog.body} />
    </main>
  );
}
