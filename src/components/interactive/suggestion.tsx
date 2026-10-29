import { Button } from "@/components/ui/button";
import { createContext, useContext, useState, type ReactNode } from "react";
import { api, errorCode, errorMessage } from "../../api";
import type { SuggestionDecision } from "../../protocol/types";
import type { RendererProps, Renderers } from "./catalogue";

/** `suggestion` version 1 data, as the core completes it: the document, the passage the
 * suggestion was based on, and the suggested text. */
interface SuggestionData {
  document_id?: string;
  base?: string;
  text?: string;
}

const DECISIONS: Record<SuggestionDecision, string> = {
  accepted: "Accepted",
  rejected: "Discarded",
  dismissed: "Dismissed",
};

/** What the user decided about a suggestion; null while it waits. */
export function suggestionDecision(answer: unknown): SuggestionDecision | null {
  if (answer && typeof answer === "object" && "decision" in answer) {
    const decision = answer.decision as SuggestionDecision;
    if (decision in DECISIONS) return decision;
  }
  return null;
}

/** What a thread lets its suggestions do: accept one into the open document, which only the
 * document view can, and whether the thread's passage is lost. */
interface ThreadSuggestions {
  accept: (messageId: string, componentId: string) => Promise<void>;
  detached: boolean;
}

// Provided around a thread's messages; elsewhere a suggestion can only be discarded.
const ThreadSuggestionsContext = createContext<ThreadSuggestions | null>(null);

export function ThreadSuggestionsProvider({
  value,
  children,
}: {
  value: ThreadSuggestions;
  children: ReactNode;
}) {
  return (
    <ThreadSuggestionsContext.Provider value={value}>{children}</ThreadSuggestionsContext.Provider>
  );
}

/** A suggestion in its Mini-Me's reply: the suggested text with Accept and resolve and Discard
 * while it waits, then with the decision. */
function SuggestionV1({ data, answer, projectId, messageId, componentId }: RendererProps) {
  const { text = "" } = (data ?? {}) as SuggestionData;
  const thread = useContext(ThreadSuggestionsContext);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const decision = suggestionDecision(answer);
  if (decision) return <SuggestionCard text={text} decision={decision} />;

  /** Runs one answer, keeping a conflict to show instead of Accept. */
  async function respond(action: (messageId: string, componentId: string) => Promise<void>) {
    if (!messageId || !componentId) return;
    setBusy(true);
    setFailure(null);
    try {
      await action(messageId, componentId);
    } catch (e) {
      if (errorCode(e) === "suggestion_conflict") setConflict(errorMessage(e));
      else setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SuggestionCard
      text={text}
      decision={null}
      problem={conflict ?? failure}
      canAccept={Boolean(thread) && !thread?.detached && !conflict}
      busy={busy}
      onAccept={() => void respond((m, c) => thread!.accept(m, c))}
      onDiscard={() =>
        projectId && void respond((m, c) => api.answerSuggestion(projectId, m, c, "rejected"))
      }
    />
  );
}

export const renderers: Renderers = { 1: SuggestionV1 };

/** A suggestion's text, labelled with its decision once answered, or with the answers it can
 * still take and why one failed. */
export function SuggestionCard({
  text,
  decision,
  problem = null,
  canAccept = false,
  busy = false,
  onAccept,
  onDiscard,
}: {
  text: string;
  decision: SuggestionDecision | null;
  problem?: string | null;
  canAccept?: boolean;
  busy?: boolean;
  onAccept?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-card-edge bg-card px-4 py-3">
      <span className="text-meta text-muted-foreground">
        Suggested edit{decision && ` · ${DECISIONS[decision]}`}
      </span>
      <p className="text-ui whitespace-pre-wrap text-foreground wrap-anywhere">{text}</p>
      {problem && <p className="text-meta text-destructive">{problem}</p>}
      {!decision && (
        <div className="flex flex-wrap gap-2">
          {canAccept && (
            <Button size="sm" disabled={busy} onClick={onAccept}>
              Accept and resolve
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
