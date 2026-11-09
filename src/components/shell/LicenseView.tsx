import { Button } from "@/components/ui/button";
import notice from "../../../NOTICE?raw";
import license from "../../../LICENSE?raw";

/** Mini-Me's own notice and license, from Settings → About. Its column is centred in the sheet,
 * like What's new. */
export function LicenseView({ onClose }: { onClose: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-10 py-9">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <h1 className="font-serif text-sheet-title font-medium text-foreground">License</h1>
        <Button onClick={onClose}>Close</Button>
      </header>
      <pre className="font-mono text-meta whitespace-pre-wrap text-foreground">
        {notice.trim()}
      </pre>
      <pre className="mx-auto mt-6 w-fit max-w-full font-mono text-meta whitespace-pre-wrap text-muted-foreground">
        {license.trim()}
      </pre>
    </main>
  );
}
