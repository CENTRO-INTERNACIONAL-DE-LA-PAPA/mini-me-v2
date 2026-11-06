import { Button } from "@/components/ui/button";
import { Fragment, useState } from "react";
import { api, errorMessage } from "../../api";
import type { JevRecord } from "../../protocol/types";
import { answerRows, questionWords } from "./jevDebug";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** The "[DEBUG] Jev" block under a user message: Jev's debug record, read each time the block
 * is opened, so a record written or cleared since shows as it is. Options that are IDs are
 * shown by their Mini-Me's or file's name. */
export function JevDebugBlock({
  projectId,
  messageId,
  miniMeName,
}: {
  projectId: string;
  messageId: string;
  miniMeName: (id: string) => string | undefined;
}) {
  // `undefined` until the block is first opened; `null` when the message has no record.
  const [record, setRecord] = useState<JevRecord | null | undefined>(undefined);
  const [fileNames, setFileNames] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setNote(null);
    try {
      const [found = null] = await api.getDebugRecords<JevRecord>(projectId, messageId, "jev");
      setRecord(found);
      if (found?.answers?.file || found?.asked?.questions.file) {
        const assets = await api.listAssets(projectId, "");
        setFileNames(new Map(assets.map((a) => [a.id, a.name])));
      }
    } catch (e) {
      setNote(errorMessage(e));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
      setNote("Copied");
    } catch {
      setNote("Could not copy");
    }
  }

  const label = (option: string) => miniMeName(option) ?? fileNames.get(option) ?? option;

  return (
    <details
      className="text-meta text-muted-foreground"
      onToggle={(event) => event.currentTarget.open && load()}
    >
      <summary className="cursor-pointer select-none">[DEBUG] Jev</summary>
      {record === null && <p className="mt-1">Nothing recorded for this message</p>}
      {record && (
        <div className="mt-1 flex flex-col gap-2">
          {(record.error || record.answers) && (
            <div className="flex flex-col gap-1">
              <p className="text-foreground">What Jev answered</p>
              {record.error && (
                <p>
                  {record.error.code}: {record.error.message}
                </p>
              )}
              {record.answers && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {answerRows(record.answers).map((row) => (
                    <Fragment key={row.question}>
                      <dt>{row.question}</dt>
                      <dd className="wrap-anywhere">
                        <span className="text-foreground">
                          {label(row.choice)} {percent(row.confidence)}
                        </span>
                        {row.others.length > 0 && (
                          <span className="block">
                            {row.others
                              .map((o) => `${label(o.option)} ${percent(o.probability)}`)
                              .join(", ")}
                          </span>
                        )}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              )}
            </div>
          )}
          {record.asked && (
            <div className="flex flex-col gap-1">
              <p className="text-foreground">What Jev was asked</p>
              <pre className="font-mono whitespace-pre-wrap wrap-anywhere">
                {JSON.stringify(record.asked.state, null, 2)}
              </pre>
              {Object.entries(record.asked.questions).map(([id, question]) => (
                <div key={id}>
                  <p>
                    <span className="text-foreground">{questionWords(id)}</span>{" "}
                    {question.instructions}
                  </p>
                  <ul className="ms-3">
                    {Object.entries(question.options).map(([option, text]) => (
                      <li key={option} className="wrap-anywhere">
                        {label(option)}: {text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" onClick={copy}>
              Copy as JSON
            </Button>
          </div>
        </div>
      )}
      {note && <p className="mt-1">{note}</p>}
    </details>
  );
}
