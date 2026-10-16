import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useId, useState } from "react";
import type { Renderers } from "./catalogue";
import { openLink, webUrl } from "./links";

/** `theories` version 1 data, `{ theories, references }`, as *Theorize* builds it. */
interface Wording {
  plain: string;
  technical?: string | null;
}

interface Theory {
  name: Wording;
  description?: Wording | null;
  statements: { text: Wording; evidence?: { text: string; refs?: number[] }[] }[];
}

interface Reference {
  title: string;
  year?: number | null;
  url?: string | null;
}

type Version = "plain" | "technical";

const VERSION_LABEL: Record<Version, string> = {
  plain: "Plain language",
  technical: "Technical",
};

/** The wording to show; a missing technical text shows the plain one. */
export function worded(wording: Wording, version: Version): string {
  return version === "technical" ? wording.technical || wording.plain : wording.plain;
}

/** Citations `[1, 3]` linking to the references' anchors under `prefix`. */
function Citations({ refs, prefix }: { refs: number[]; prefix: string }) {
  if (refs.length === 0) return null;
  return (
    <span className="text-muted-foreground">
      {" ["}
      {refs.map((ref, index) => (
        <span key={ref}>
          {index > 0 && ", "}
          <a href={`#${prefix}-${ref}`} className="text-foreground hover:opacity-70">
            {ref}
          </a>
        </span>
      ))}
      {"]"}
    </span>
  );
}

interface SectionProps {
  theory: Theory;
  number: number;
  /** Prefix of the reference anchors that citations link to. */
  prefix: string;
}

function TheorySection({ theory, number, prefix }: SectionProps) {
  const [version, setVersion] = useState<Version>("plain");
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <header className="flex items-start gap-3">
        <h3 className="flex-1 text-[15px] leading-snug font-semibold text-balance text-foreground">
          {number}. {worded(theory.name, version)}
        </h3>
        <Select value={version} onValueChange={(value) => setVersion(value as Version)}>
          <SelectTrigger size="sm" aria-label={`Wording of theory ${number}`}>
            <SelectValue>{(value: Version) => VERSION_LABEL[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plain">{VERSION_LABEL.plain}</SelectItem>
            <SelectItem value="technical">{VERSION_LABEL.technical}</SelectItem>
          </SelectContent>
        </Select>
      </header>
      {theory.description && (
        <p className="text-ui text-pretty text-ink-2">{worded(theory.description, version)}</p>
      )}
      {theory.statements.length > 0 && (
        <ul className="flex list-disc flex-col gap-3 pl-5">
          {theory.statements.map((statement, index) => (
            <li key={index} className="text-ui text-foreground">
              <span className="font-medium">{worded(statement.text, version)}</span>
              {(statement.evidence ?? []).length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {(statement.evidence ?? []).map((item, i) => (
                    <li key={i} className="text-meta text-pretty text-ink-2">
                      {item.text}
                      <Citations refs={item.refs ?? []} prefix={prefix} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Theories({ data }: { data: unknown }) {
  const { theories, references } = data as { theories: Theory[]; references: Reference[] };
  const prefix = `ref-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
      {theories.map((theory, index) => (
        <TheorySection key={index} theory={theory} number={index + 1} prefix={prefix} />
      ))}
      {references.length > 0 && (
        <section aria-label="References" className="border-t border-border bg-muted px-4 py-3">
          <h3 className="mb-2 text-meta font-medium text-muted-foreground">References</h3>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-meta text-ink-2">
            {references.map((reference, index) => {
              const url = webUrl(reference.url);
              const label = `${reference.title}${reference.year ? ` (${reference.year})` : ""}`;
              return (
                <li key={index} id={`${prefix}-${index + 1}`} className="scroll-mt-4">
                  {url ? (
                    <button
                      type="button"
                      title={url}
                      className="cursor-pointer text-left text-foreground hover:opacity-70"
                      onClick={() => openLink(url)}
                    >
                      {label}
                    </button>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

export const renderers: Renderers = {
  1: Theories,
};
