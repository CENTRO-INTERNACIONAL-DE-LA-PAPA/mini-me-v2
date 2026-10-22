import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { api, errorCode, errorMessage } from "../api";
import {
  activeQuery,
  assetTarget,
  caretStep,
  draftMessage,
  insertReference,
  miniMeSuggestions,
  miniMeTarget,
  pillAt,
  segments,
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
import { ArrowUpIcon, AtSignIcon, HashIcon, PaperclipIcon, SquareIcon } from "lucide-react";
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
  "px-4 pt-3 pb-1 text-body whitespace-pre-wrap wrap-break-word [scrollbar-gutter:stable]";

/** An entry in the `@` or `#` list. */
interface Suggestion {
  target: ReferenceTarget;
  miniMe?: MiniMe;
}

/** A picked mention's colours on the layer: the pill's, with a same-coloured shadow for its
 * height, since padding would move the text away from the text box's caret. Its width comes
 * from the `PILL_PAD`s inside it. */
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
  /** The mouse is down on the text box, so the selection is still being dragged. */
  const dragging = useRef(false);
  /** The references of every text the box has held since the last send, so an undo that
   * brings a text back brings its pills back too. */
  const known = useRef(new Map<string, DraftReference[]>());
  const sidecar = useSidecarStatus();
  const ready = sidecarReady(sidecar);
  const miniMes = useMiniMes();
  const miniMeById = (id: string) => miniMes.find((m) => m.id === id);
  // The first Mini-Me the draft mentions answers it; without one, Mini-Me picks who answers.
  const mentioned = references.find((r) => r.kind === "mini_me");
  const asked = mentioned && miniMeById(mentioned.id);

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
    return found && !refs.some((r) => r.start <= found.start && found.start < r.end) ? found : null;
  }

  function edit(next: string, cursor: number) {
    const nextReferences = known.current.get(next) ?? updateReferences(text, next, references);
    known.current.set(next, nextReferences);
    setReferences(nextReferences);
    setText(next);
    setQuery(queryAt(next, cursor, nextReferences));
    setError(null);
  }

  function pick(target: ReferenceTarget) {
    if (!query) {
      return;
    }
    // The end of the selection, so that the reference replaces any selected text.
    const end = input.current?.selectionEnd ?? text.length;
    const result = insertReference(text, references, query.start, end, target);
    known.current.set(result.text, result.references);
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
        ...draftMessage(text, references),
        attachments: attachments.map((a) => a.id),
      });
      setText("");
      setReferences([]);
      known.current.clear();
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

  /** Types `@` or `#` at the caret, with a space before it when needed, to open its list. */
  function startReference(sign: "@" | "#") {
    const box = input.current;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;
    const inserted = start > 0 && !/\s/.test(text[start - 1]) ? ` ${sign}` : sign;
    const cursor = start + inserted.length;
    edit(text.slice(0, start) + inserted + text.slice(end), cursor);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(cursor, cursor);
    });
  }

  async function stop() {
    try {
      await api.stopReply(projectId, conversationId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /**
   * Moves the caret over a picked reference, extends a selection over it, and deletes it, as one
   * block. Returns whether the key was handled here instead of by the text box.
   */
  function pillKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const box = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = box;
    const collapsed = start === end;
    const word = event.altKey || event.ctrlKey;
    if (event.nativeEvent.isComposing) {
      return false;
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !word && !event.metaKey) {
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      // A selection made with the mouse can have no direction; Shift+arrow then moves the end
      // in the arrow's direction, as the system does.
      const focusAtStart =
        collapsed ||
        box.selectionDirection === "backward" ||
        (box.selectionDirection === "none" && direction < 0);
      const anchor = focusAtStart ? end : start;
      const focus = focusAtStart ? start : end;
      if (!event.shiftKey && !collapsed) {
        return false;
      }
      const next = caretStep(references, focus, direction);
      if (next === focus + direction) {
        return false;
      }
      event.preventDefault();
      if (event.shiftKey) {
        box.setSelectionRange(
          Math.min(anchor, next),
          Math.max(anchor, next),
          next < anchor ? "backward" : "forward",
        );
      } else {
        box.setSelectionRange(next, next);
      }
      return true;
    }
    if (collapsed && (event.key === "Backspace" || event.key === "Delete") && !event.metaKey) {
      const back = event.key === "Backspace";
      // A word deletion also takes the spaces between the caret and the pill.
      const pill = references.find((r) => {
        if (back ? r.end > start : r.start < start) {
          return false;
        }
        const between = back ? box.value.slice(r.end, start) : box.value.slice(start, r.start);
        return between === "" || (word && /^\s+$/.test(between));
      });
      // Selecting the pill lets the text box's own deletion remove it, which keeps undo working.
      if (pill) {
        box.setSelectionRange(back ? pill.start : start, back ? start : pill.end);
      }
    }
    return false;
  }

  /**
   * Keeps the selection's ends out of picked references: a caret inside one moves to its
   * nearest edge, and a selection grows to hold the whole reference.
   */
  function snapSelection(box: HTMLTextAreaElement) {
    // Before the text state catches up with an edit, `references` holds the old offsets, so
    // snapping waits for the next selection.
    if (dragging.current || box.value !== text) {
      return;
    }
    const { selectionStart: start, selectionEnd: end, selectionDirection } = box;
    if (start === end) {
      const pill = pillAt(references, start);
      if (pill) {
        const edge = start - pill.start < pill.end - start ? pill.start : pill.end;
        box.setSelectionRange(edge, edge);
      }
      return;
    }
    const from = pillAt(references, start)?.start ?? start;
    const to = pillAt(references, end)?.end ?? end;
    if (from !== start || to !== end) {
      box.setSelectionRange(from, to, selectionDirection);
    }
  }

  /** Copies or cuts the selection as it would be sent, without the pills' padding. */
  function copy(event: ClipboardEvent<HTMLTextAreaElement>, cut: boolean) {
    const box = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = box;
    const inside = references
      .filter((r) => start <= r.start && r.end <= end)
      .map((r) => ({ ...r, start: r.start - start, end: r.end - start }));
    if (inside.length === 0) {
      return;
    }
    event.preventDefault();
    const { content } = draftMessage(box.value.slice(start, end), inside);
    event.clipboardData.setData("text/plain", content);
    if (cut) {
      // Deleting through the editing command, unlike setting the value, keeps undo working.
      document.execCommand("delete");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (pillKey(event)) {
      return;
    }
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
    <div className="relative mx-auto w-full max-w-[760px] px-8 pt-2 pb-5">
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
      <div className="rounded-2xl border border-border-composer bg-card shadow-composer">
        <div className="relative">
          <div
            ref={layer}
            aria-hidden
            className={cn(
              FIELD,
              "pointer-events-none absolute inset-0 overflow-hidden",
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
            rows={1}
            className={cn(
              FIELD,
              "relative max-h-48 min-h-9 resize-none rounded-none border-0",
              "bg-transparent text-transparent caret-foreground",
              "selection:bg-primary selection:text-primary-foreground",
            )}
            placeholder="Ask a Mini-Me, or type @ to choose one…"
            onChange={(e) => edit(e.target.value, e.target.selectionStart)}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (layer.current) layer.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onSelect={(e) => {
              snapSelection(e.currentTarget);
              setQuery(queryAt(e.currentTarget.value, e.currentTarget.selectionStart, references));
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) {
                return;
              }
              const box = e.currentTarget;
              dragging.current = true;
              // On the window, so a drag released outside the text box also ends; moving
              // selected text by dragging it ends with `dragend` instead of `mouseup`.
              const done = () => {
                dragging.current = false;
                window.removeEventListener("mouseup", done);
                window.removeEventListener("dragend", done);
                snapSelection(box);
              };
              window.addEventListener("mouseup", done);
              window.addEventListener("dragend", done);
            }}
            onBlur={() => {
              dragging.current = false;
            }}
            onCopy={(e) => copy(e, false)}
            onCut={(e) => copy(e, true)}
          />
        </div>
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mention a Mini-Me"
            title="Mention a Mini-Me"
            onClick={() => startReference("@")}
          >
            <AtSignIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reference a file"
            title="Reference a file"
            onClick={() => startReference("#")}
          >
            <HashIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach files"
            title="Attach files"
            onClick={attach}
          >
            <PaperclipIcon />
          </Button>
          <span className="ml-2 flex-1 truncate text-meta text-muted-foreground">
            {asked ? (
              <span className="flex items-center gap-1.5">
                Asking <MiniMePill miniMe={asked}>{asked.name}</MiniMePill>
              </span>
            ) : (
              "Auto-pick Mini-Me"
            )}
          </span>
          {replying ? (
            <Button
              size="icon"
              className="rounded-full"
              aria-label="Stop the reply"
              title="Stop the reply"
              onClick={stop}
            >
              <SquareIcon className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="rounded-full"
              aria-label="Send"
              title="Send"
              onClick={send}
              disabled={!text.trim() || !ready || choosing}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
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
  const row = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <button
      role="option"
      aria-selected={selected}
      ref={row}
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
