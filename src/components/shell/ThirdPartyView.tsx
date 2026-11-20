import { Empty, EmptyDescription } from "@/components/ui/empty";
import { SheetPage } from "./Sheet";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import type { ThirdParty, ThirdPartyComponent } from "../../protocol/types";
import { openLink } from "../interactive/links";
import { ErrorText } from "./ErrorText";

const PARTS: { part: ThirdPartyComponent["part"]; title: string }[] = [
  { part: "core", title: "Core" },
  { part: "interface", title: "Interface" },
  { part: "runtime", title: "AI runtime" },
];

const anchor = (index: number) => `third-party-${index}`;

/** The third-party software this build ships, from Settings → About: a table of contents by
 * part of the app, then each component with its license texts. */
export function ThirdPartyView({ onClose }: { onClose: () => void }) {
  // `undefined` while loading; `null` in a build without the list.
  const [list, setList] = useState<ThirdParty | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getThirdParty()
      .then((found) => active && setList(found))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  // The view scrolls inside the sheet, so a link's own jump would not reach its section.
  const go = (index: number) =>
    document.getElementById(anchor(index))?.scrollIntoView({ block: "start" });

  return (
    <SheetPage
      title="Third-party Software"
      actions={<Button onClick={onClose}>Close</Button>}
      className="mx-auto max-w-[760px]"
    >
      {error && <ErrorText>{error}</ErrorText>}
      {list === null && (
        <Empty>
          <EmptyDescription>
            The list of third-party software comes with released builds.
          </EmptyDescription>
        </Empty>
      )}
      {list && (
        <>
          <nav aria-label="Contents" className="grid gap-4">
            {PARTS.map(({ part, title }) => (
              <div key={part} className="grid gap-1">
                <h2 className="text-ui font-medium text-foreground">{title}</h2>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-meta">
                  {list.components.map(
                    (c, index) =>
                      c.part === part && (
                        <li key={index}>
                          <a
                            href={`#${anchor(index)}`}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.preventDefault();
                              go(index);
                            }}
                          >
                            {c.name}
                          </a>
                        </li>
                      ),
                  )}
                </ul>
              </div>
            ))}
          </nav>
          {list.components.map((c, index) => (
            <section key={index} id={anchor(index)} className="grid scroll-mt-4 gap-2">
              <h3 className="text-ui font-medium text-foreground">
                {c.name} {c.version}
              </h3>
              <p className="text-meta text-muted-foreground">
                {c.license}
                {c.repository && (
                  <>
                    {" ("}
                    <a
                      href={c.repository}
                      onClick={(event) => {
                        event.preventDefault();
                        openLink(c.repository!);
                      }}
                    >
                      {c.repository}
                    </a>
                    )
                  </>
                )}
              </p>
              {c.texts.map((text) => (
                <pre
                  key={text}
                  className="font-mono text-meta whitespace-pre-wrap text-muted-foreground"
                >
                  {list.texts[text]}
                </pre>
              ))}
            </section>
          ))}
        </>
      )}
    </SheetPage>
  );
}
