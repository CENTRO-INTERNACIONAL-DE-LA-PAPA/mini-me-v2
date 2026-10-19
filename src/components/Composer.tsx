import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, errorCode, errorMessage } from "../api";
import {
  activeQuery,
  assetTarget,
  insertReference,
  miniMeSuggestions,
  miniMeTarget,
  segments,
  toTextComponents,
  updateReferences,
  type DraftReference,
  type ReferenceKind,
  type ReferenceTarget,
} from "../protocol/references";
import type { AssetRef, Message, MiniMe } from "../protocol/types";
import { formatSize } from "./format";
import { MiniMePill, pillStyle } from "./MiniMePill";
import { sidecarReady, useSidecarStatus } from "./SidecarStatusLine";
import { useMiniMes } from "./useMiniMes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  conversationId: string;
  replying: boolean;
  /** Mini-Me is deciding who answers the last message; sending waits until it has. */
  choosing: boolean;
  onSent: (message: Message) => void;
}

/** The typography and box shared by the text box and the layer that draws its pills. */
const FIELD =
  "px-3 py-[7px] text-body whitespace-pre-wrap wrap-break-word [scrollbar-gutter:stable]";

/** An entry in the `@` or `#` list. */
interface Suggestion {
  target: ReferenceTarget;
  miniMe?: MiniMe;
}

/** A picked mention's colours on the layer: the pill's, with a same-coloured shadow standing in
 * for padding, since padding would move the text away from the text box's caret. */
function layerPillStyle(miniMe?: MiniMe) {
  const style = pillStyle(miniMe);
  return style && { ...style, boxShadow: `0 0 0 2px ${miniMe!.colors.tint}` };
}

export function Composer({ projectId, conversationId, replying, choosing, onSent }: Props) {
  const [text, setText] = useState("");
  const [references, setReferences] = useState<DraftReference[]>([]);
  const [attachments, setAttachments] = useState<AssetRef[]>([]);
  const [query, setQuery] = useState<{ start: number; query: string; kind: ReferenceKind } | null>(
    null,
  );
  const [assetSuggestions, setAssetSuggestions] = useState<AssetRef[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const sidecar = useSidecarStatus();
  const ready = sidecarReady(sidecar);
  const miniMes = useMiniMes();
  const miniMeById = (id: string) => miniMes.find((m) => m.id === id);

  useEffect(() => {
    if (query?.kind !== "asset") {
      setAssetSuggestions([]);
      return;
    }
    let current = true;
    api
      .listAssets(projectId, query.query)
      .then((assets) => current && setAssetSuggestions(assets.slice(0, 8)))
      .catch(() => current && setAssetSuggestions([]));
    return () => {
      current = false;
    };
  }, [projectId, query]);

  useEffect(() => setHighlight(0), [query?.kind, query?.query]);

  /** The list's sections: a heading (empty for files) and its entries. */
  const sections: Array<{ heading: string; entries: Suggestion[] }> =
    query?.kind === "mini_me"
      ? miniMeSuggestions(miniMes, query.query).map((section) => ({
          heading: section.label,
          entries: section.miniMes.map((m) => ({ target: miniMeTarget(m), miniMe: m })),
        }))
      : assetSuggestions.length > 0
        ? [{ heading: "", entries: assetSuggestions.map((a) => ({ target: assetTarget(a) })) }]
        : [];
  const suggestions = sections.flatMap((section) => section.entries);

  /** The query at the cursor, unless its `#` or `@` belongs to an existing reference. */
  function queryAt(value: string, cursor: number, refs: DraftReference[]) {
    const found = activeQuery(value, cursor);
    return found && !refs.some((r) => r.start === found.start) ? found : null;
  }

  function edit(next: string, cursor: number) {
    const nextReferences = updateReferences(text, next, references);
    setReferences(nextReferences);
    setText(next);
    setQuery(queryAt(next, cursor, nextReferences));
    setError(null);
  }

  function pick(target: ReferenceTarget) {
    if (!query) {
      return;
    }
    const cursor = input.current?.selectionStart ?? text.length;
    const result = insertReference(text, references, query.start, cursor, target);
    setText(result.text);
    setReferences(result.references);
    setQuery(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  async function attach() {
    try {
      const imported = await api.importAssets(projectId);
      setAttachments((current) => [...current, ...imported]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function send() {
    if (!text.trim() || replying || choosing || !ready) {
      return;
    }
    try {
      const message = await api.sendMessage(projectId, conversationId, {
        content: text,
        attachments: attachments.map((a) => a.id),
        text_components: toTextComponents(references),
      });
      setText("");
      setReferences([]);
      setAttachments([]);
      setQuery(null);
      onSent(message);
    } catch (e) {
      setError(
        errorCode(e) === "reply_in_progress"
          ? "A reply is still in progress. Stop it to send a new message."
          : errorMessage(e),
      );
    }
  }

  async function stop() {
    try {
      await api.stopReply(projectId, conversationId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const listed = query !== null && suggestions.length > 0;
    if (listed && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (listed && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      pick(suggestions[Math.min(highlight, suggestions.length - 1)].target);
    } else if (event.key === "Escape") {
      setQuery(null);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="relative bg-background px-8 pt-3 pb-4">
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={query?.kind === "mini_me" ? "Mini-Mes" : "Files"}
          className={cn(
            "absolute bottom-full left-8 max-h-80 w-80 overflow-y-auto rounded-xl border",
            "border-border bg-popover p-1 text-popover-foreground shadow-float",
          )}
        >
          {sections.map((section, index) => (
            <div key={index} role="group" aria-label={section.heading || undefined}>
              {section.heading && (
                <p className="px-2.5 pt-2 pb-1 text-meta text-muted-foreground">
                  {section.heading}
                </p>
              )}
              {section.entries.map((suggestion) => (
                <SuggestionRow
                  key={suggestion.target.id}
                  suggestion={suggestion}
                  selected={suggestions[highlight] === suggestion}
                  onPick={() => pick(suggestion.target)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((asset) => (
            <Badge key={asset.id} variant="secondary">
              {asset.name} · {formatSize(asset.size_bytes)}
              <button
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${asset.name}`}
                onClick={() => setAttachments((current) => current.filter((a) => a.id !== asset.id))}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-meta text-destructive">{error}</p>}
      {!ready && sidecar && (
        <p role="status" className="mb-2 text-meta text-muted-foreground">
          {sidecar.detail}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Button variant="outline" onClick={attach} title="Attach files">
          Attach
        </Button>
        <div className="relative min-w-0 flex-1 rounded-2xl bg-card shadow-composer">
          <div
            ref={layer}
            aria-hidden
            className={cn(
              FIELD,
              "pointer-events-none absolute inset-0 overflow-hidden border border-transparent",
              "text-foreground",
            )}
          >
            {segments(text, references).map((segment, index) => {
              const miniMe =
                segment.component?.kind === "mini_me"
                  ? miniMeById(segment.component.id)
                  : undefined;
              return segment.component ? (
                <span
                  key={index}
                  className={cn(
                    "rounded-full box-decoration-clone",
                    !miniMe && "bg-muted text-ink-2 shadow-[0_0_0_2px_var(--muted)]",
                  )}
                  style={layerPillStyle(miniMe)}
                >
                  {segment.text}
                </span>
              ) : (
                <span key={index}>{segment.text}</span>
              );
            })}
            {/* Gives a trailing empty line the same height as in the text box. */}
            {"\u200b"}
          </div>
          <Textarea
            ref={input}
            value={text}
            rows={2}
            className={cn(
              FIELD,
              "relative max-h-48 min-h-9 resize-none rounded-2xl border-border-composer",
              "bg-transparent text-transparent caret-foreground",
              "selection:bg-primary selection:text-primary-foreground",
            )}
            placeholder="Write a message. Type @ to ask a Mini-Me, # to reference a file."
            onChange={(e) => edit(e.target.value, e.target.selectionStart)}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (layer.current) layer.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onSelect={(e) =>
              setQuery(queryAt(e.currentTarget.value, e.currentTarget.selectionStart, references))
            }
          />
        </div>
        {replying ? (
          <Button variant="destructive" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button onClick={send} disabled={!text.trim() || !ready || choosing}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

/** One entry in the `@` or `#` list: a Mini-Me's pill and description, or a file name. */
function SuggestionRow({
  suggestion,
  selected,
  onPick,
}: {
  suggestion: Suggestion;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={selected}
      ref={selected ? (row) => row?.scrollIntoView({ block: "nearest" }) : undefined}
      className={cn(
        "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5",
        "text-left",
        selected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
    >
      {suggestion.miniMe ? (
        <>
          <MiniMePill miniMe={suggestion.miniMe}>{suggestion.target.label}</MiniMePill>
          <span
            className={cn(
              "line-clamp-1 text-meta",
              selected ? "text-muted-on-ink" : "text-muted-foreground",
            )}
          >
            {suggestion.miniMe.description}
          </span>
        </>
      ) : (
        <span className="text-ui">{suggestion.target.label}</span>
      )}
    </button>
  );
}
