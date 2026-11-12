import { Button } from "@/components/ui/button";
import type { QuartoStatus } from "../../protocol/types";
import { openLink } from "../interactive/links";
import { quartoNotice } from "./quarto";

/** Why documents need a usable Quarto, with a link to install it and a button to look again. */
export function QuartoNotice({ status, onCheck }: { status: QuartoStatus; onCheck: () => void }) {
  return (
    <div role="status" className="m-6 grid max-w-md gap-3 rounded-card bg-card p-5">
      <h3 className="font-serif text-name text-foreground">Quarto is needed</h3>
      <p className="text-ui text-ink-2">{quartoNotice(status)}</p>
      <div className="flex gap-2">
        <Button onClick={() => openLink(status.install_url)}>Get Quarto</Button>
        <Button variant="outline" onClick={onCheck}>
          Check again
        </Button>
      </div>
    </div>
  );
}
