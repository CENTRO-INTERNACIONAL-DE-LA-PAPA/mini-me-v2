import { Button } from "@/components/ui/button";
import { changelog } from "../../lib/changelog";
import { Markdown } from "../chat/Markdown";

/** The changes of the version this build is, from the changelog bundled in it. Shown once after
 * an update, and from Settings → About. Its column is centred in the sheet, like Settings'. */
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
