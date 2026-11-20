import { SheetPage } from "./Sheet";
import { Button } from "@/components/ui/button";
import notice from "../../../NOTICE?raw";
import license from "../../../LICENSE?raw";

/** Mini-Me's own notice and license, from Settings → About. */
export function LicenseView({ onClose }: { onClose: () => void }) {
  return (
    <SheetPage
      title="License"
      actions={<Button onClick={onClose}>Close</Button>}
      className="mx-auto max-w-[760px]"
    >
      <pre className="font-mono text-meta whitespace-pre-wrap text-foreground">
        {notice.trim()}
      </pre>
      <pre className="mx-auto mt-6 w-fit max-w-full font-mono text-meta whitespace-pre-wrap text-muted-foreground">
        {license.trim()}
      </pre>
    </SheetPage>
  );
}
