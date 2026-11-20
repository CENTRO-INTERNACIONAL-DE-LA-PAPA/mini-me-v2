import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  BoldIcon,
  FileDownIcon,
  Heading1Icon,
  Heading2Icon,
  ItalicIcon,
  ListIcon,
  MessageSquarePlusIcon,
  MessageSquareTextIcon,
  QuoteIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorMessage } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import { recheckQuarto, useQuarto } from "../../hooks/useQuarto";
import { formatRelative } from "../../lib/format";
import type { AssetRef, CommentThread, Suggestion, Uuid } from "../../protocol/types";
import { EditorHeader } from "../library/LibraryParts";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MainSheet } from "../shell/Sheet";
import {
  placeSuggestions,
  placeThreads,
  savedAnchors,
  setSuggestionPlacements,
  setThreadPlacements,
  suggestionPlacements,
  threadPlacements,
  type Placement,
} from "./anchors";
import { CommentsSheet, threadsInOrder } from "./CommentsSheet";
import {
  setHighlighted,
  suggestionAt,
  threadAt,
  threadHighlights,
  type Suggested,
} from "./highlights";
import { headerField } from "./qmd";
import { documentsBlocked } from "./quarto";
import { QuartoNotice } from "./QuartoNotice";
import { blockPrefix, wrapSelection } from "./sourceEdits";
import { SuggestionPopover, type PopoverAnchor } from "./SuggestionPopover";

/** How long typing must pause before a document is saved. */
const SAVE_DELAY_MS = 1000;
/** How often the source shows newly drafted text. */
const DRAFT_REFRESH_MS = 250;

/** The bar over the source and the preview: the formatting buttons, and the preview's state. */
const BAR = "mt-5 flex h-11 shrink-0 items-center gap-0.5 border-y border-border bg-background px-4";

interface Props {
  projectId: Uuid;
  assetId: Uuid;
  /** Where the back link returns to, such as the Conversation's title or "Files". */
  back: string;
  /** Set for a document just created to be drafted from this Conversation. */
  draftFrom?: Uuid;
  onClose: () => void;
}

/** Source highlighting in the theme's colours: headings and strong text in ink, the rest of
 * Markdown's marks muted. */
const highlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--foreground)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--ink-2)", textDecoration: "underline" },
  {
    tag: [tags.processingInstruction, tags.meta, tags.monospace, tags.contentSeparator],
    color: "var(--muted-foreground)",
  },
  { tag: tags.quote, color: "var(--ink-2)" },
]);

// The editor grows with its text on a page that the pane around it scrolls, so it has no
// scroller of its own.
const theme = EditorView.theme({
  "&": { minHeight: "100%", fontSize: "var(--text-ui)", color: "var(--document-ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7", overflow: "visible" },
  ".cm-content": { padding: "36px 40px 56px", caretColor: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--accent)",
  },
});

/** A document's Quarto source, saved as the user types, beside a preview rendered like the PDF
 * export, and its comment threads; a draft fills as Scribe writes, editable once it ends. */
export function DocumentView({
  projectId,
  assetId,
  back,
  draftFrom,
  onClose,
}: Props) {
  const [text, setText] = useState("");
  const [editedAt, setEditedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(Boolean(draftFrom));
  const [exported, setExported] = useState<AssetRef | null>(null);
  const [exporting, setExporting] = useState(false);
  // Whether the saved PDF's popover is open, apart from `exported`, so the PDF's name stays
  // while the popover fades out.
  const [showExported, setShowExported] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [placements, setPlacementsShown] = useState<ReadonlyMap<Uuid, Placement>>(new Map());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsPlaced, setSuggestionsPlaced] = useState<ReadonlyMap<Uuid, Placement>>(
    new Map(),
  );
  const [chosen, setChosen] = useState<{ id: Uuid; anchor: PopoverAnchor } | null>(null);
  const [selected, setSelected] = useState<Uuid | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const miniMes = useMiniMes();
  const scribe = miniMes.find((m) => m.name === "Scribe");
  const quarto = useQuarto();
  const blocked = documentsBlocked(quarto);

  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const pending = useRef<number | null>(null);
  const draftId = useRef<string | null>(null);
  // Set while the source is replaced by code, so the change is not saved as an edit.
  const loading = useRef(false);
  // Whether the text has been loaded into the editor, and whether Quarto blocks the document,
  // which the load reads when it finishes.
  const loaded = useRef(false);
  const blockedRef = useRef(false);
  blockedRef.current = blocked;

  /** Saves the source; resolves false when the save failed, which the view then reports. */
  const save = useCallback(async () => {
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    const editor = view.current;
    if (!editor || !editor.state.facet(EditorView.editable)) return true;
    try {
      const text = editor.state.doc.toString();
      await api.saveDocument(projectId, assetId, text, savedAnchors(editor.state));
      setEditedAt(Date.now());
      setError(null);
      return true;
    } catch (e) {
      setError(`Not saved: ${errorMessage(e)}`);
      return false;
    }
  }, [projectId, assetId]);
  const saveRef = useRef(save);
  saveRef.current = save;

  /** Shows `next` as the source without saving it, with the threads' and suggestions'
   * placements if given. */
  const replace = (
    next: string,
    placed?: { threads: Map<Uuid, Placement>; suggestions: Map<Uuid, Placement> },
  ) => {
    const editor = view.current;
    if (!editor) return;
    loading.current = true;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: next },
      effects: placed
        ? [
            setThreadPlacements.of(placed.threads),
            setSuggestionPlacements.of(placed.suggestions),
          ]
        : [],
    });
    loading.current = false;
    setText(next);
  };

  const setEditable = (on: boolean) =>
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(on)) });

  const render = useCallback(
    async (source: string) => {
      setRendering(true);
      try {
        setPages(await api.previewDocument(projectId, source));
        setPreviewError(null);
      } catch (e) {
        setPreviewError(errorMessage(e));
      } finally {
        setRendering(false);
      }
    },
    [projectId],
  );

  // When Quarto becomes usable or stops being, the source can or cannot be edited, and the
  // preview renders again once it can.
  useEffect(() => {
    if (!loaded.current || drafting) return;
    setEditable(!blocked);
    if (!blocked) void render(text);
  }, [blocked]);

  // The editor is made once; the document's text is loaded into it below.
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: "",
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          theme,
          editable.current.of(EditorView.editable.of(false)),
          threadPlacements,
          suggestionPlacements,
          threadHighlights,
          EditorView.domEventHandlers({
            // A bubble opens its thread, and a suggested text its answers, instead of moving
            // the cursor.
            mousedown: (event) => {
              const target = event.target as Element;
              const suggested = target.closest<HTMLElement>(".cm-suggested");
              if (suggested?.dataset.suggestion) {
                const rect = suggested.getBoundingClientRect();
                setChosen({ id: suggested.dataset.suggestion, anchor: at(rect) });
                return true;
              }
              const bubble = target.closest<HTMLElement>(".cm-comment-bubble");
              if (!bubble?.dataset.thread) return false;
              setSelected(bubble.dataset.thread);
              setShowComments(true);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            const placed = update.state.field(threadPlacements);
            if (placed !== update.startState.field(threadPlacements)) setPlacementsShown(placed);
            const suggested = update.state.field(suggestionPlacements);
            if (suggested !== update.startState.field(suggestionPlacements)) {
              setSuggestionsPlaced(suggested);
            }
            if (update.selectionSet) {
              setHasSelection(!update.state.selection.main.empty);
              const clicked = update.transactions.some((t) => t.isUserEvent("select.pointer"));
              const head = update.state.selection.main.head;
              const suggestion = clicked ? suggestionAt(update.state, head) : null;
              const coords = suggestion ? update.view.coordsAtPos(head) : null;
              if (suggestion && coords) {
                const rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
                setChosen({ id: suggestion, anchor: at(rect) });
              }
              const thread = clicked && !suggestion ? threadAt(update.state, head) : null;
              if (thread) {
                setSelected(thread);
                setShowComments(true);
              }
            }
            if (!update.docChanged || loading.current) return;
            setText(update.state.doc.toString());
            if (pending.current !== null) window.clearTimeout(pending.current);
            pending.current = window.setTimeout(() => void saveRef.current(), SAVE_DELAY_MS);
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      if (draftId.current) void api.stopDraft(draftId.current);
      if (pending.current !== null) void saveRef.current();
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { text: source, modified_at } = await api.readDocument(projectId, assetId);
      const found = await api.listThreads(projectId, assetId);
      const waiting = await api.listSuggestions(projectId, assetId);
      if (!active) return;
      replace(source, {
        threads: placeThreads(source, found),
        suggestions: placeSuggestions(source, waiting),
      });
      setThreads(found);
      setSuggestions(waiting);
      if (modified_at !== null) setEditedAt(modified_at);
      loaded.current = true;
      setEditable(!blockedRef.current);
      if (!blockedRef.current) void render(source);
    };
    if (!draftFrom) {
      load().catch((e) => active && setError(errorMessage(e)));
      return () => {
        active = false;
      };
    }
    // Drafting: the source shows the header and the text as it arrives, then the saved file.
    let header = "";
    let drafted = "";
    let shown = "";
    api
      .readDocument(projectId, assetId)
      .then(({ text: source }) => {
        header = source;
        if (active) replace(source);
      })
      .catch(() => {});
    const id = crypto.randomUUID();
    draftId.current = id;
    const timer = window.setInterval(() => {
      const next = `${header.trimEnd()}\n\n${drafted}`;
      if (drafted && next !== shown) {
        shown = next;
        replace(next);
      }
    }, DRAFT_REFRESH_MS);
    const finish = (failure?: unknown) => {
      window.clearInterval(timer);
      draftId.current = null;
      if (!active) return;
      setDrafting(false);
      if (failure) setError(errorMessage(failure));
      load().catch((e) => active && setError(errorMessage(e)));
    };
    api
      .draftDocument(projectId, assetId, draftFrom, id, (event) => {
        if (event.type === "delta") drafted += event.text;
      })
      .then(() => finish(), finish);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [projectId, assetId, draftFrom, render]);

  // The source shows the open threads with their numbers, the selected one's passage
  // highlighted, and the waiting suggestions.
  useEffect(() => {
    const open = threadsInOrder(threads, placements, false);
    const visible = new Set(open.map((t) => t.conversation_id));
    const numbers = new Map(open.map((t, index) => [t.conversation_id, index + 1]));
    const suggested = new Map<Uuid, Suggested>();
    for (const { id, text, author } of suggestions) {
      const colors = miniMes.find((m) => m.id === author.id)?.colors;
      suggested.set(id, { text, colors });
    }
    view.current?.dispatch({
      effects: setHighlighted.of({ visible, selected, numbers, suggestions: suggested }),
    });
  }, [threads, placements, suggestions, selected, miniMes]);

  // A thread left before its first comment was never used, so it goes.
  const previous = useRef<Uuid | null>(null);
  useEffect(() => {
    const left = previous.current;
    previous.current = selected;
    const thread = threads.find((t) => t.conversation_id === left);
    if (left && left !== selected && thread?.comments === 0) void remove(left);
  }, [selected]);

  const place = (next: Map<Uuid, Placement>) =>
    view.current?.dispatch({ effects: setThreadPlacements.of(next) });

  async function comment() {
    const editor = view.current;
    if (!editor || editor.state.selection.main.empty) return;
    const { from, to } = editor.state.selection.main;
    // Saved first, so the stored text matches the offsets the thread is created with.
    if (!(await save())) return;
    try {
      const thread = await api.createThread(
        projectId,
        assetId,
        from,
        to,
        editor.state.sliceDoc(from, to),
      );
      setThreads((current) => [...current, thread]);
      const placed = new Map(editor.state.field(threadPlacements));
      place(placed.set(thread.conversation_id, { from, to }));
      setSelected(thread.conversation_id);
      setShowComments(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function resolve(id: Uuid, resolved: boolean) {
    try {
      await api.setThreadResolved(projectId, id, resolved);
      setThreads((current) =>
        current.map((t) => (t.conversation_id === id ? { ...t, resolved } : t)),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** Accepts a suggestion into the saved document and shows the merged text with every thread
   * and suggestion moved to fit; rejects with why it could not. */
  async function accept(id: Uuid) {
    // Saved first, so the merge starts from the text the user sees.
    if (!(await save())) throw new Error("The document could not be saved.");
    const accepted = await api.acceptSuggestion(projectId, id);
    replace(accepted.text, {
      threads: placeThreads(accepted.text, accepted.threads),
      suggestions: placeSuggestions(accepted.text, accepted.suggestions),
    });
    setThreads(accepted.threads);
    setSuggestions(accepted.suggestions);
  }

  async function discard(id: Uuid) {
    await api.discardSuggestion(projectId, id);
    setSuggestions((current) => current.filter((s) => s.id !== id));
  }

  /** Reads the waiting suggestions again. Those already shown keep the place they followed
   * through the user's edits; new ones are placed in the text as it is now. */
  async function refreshSuggestions() {
    try {
      const waiting = await api.listSuggestions(projectId, assetId);
      const editor = view.current;
      if (!editor) return;
      const placed = placeSuggestions(editor.state.doc.toString(), waiting);
      for (const [id, placement] of editor.state.field(suggestionPlacements)) {
        if (placement && placed.has(id)) placed.set(id, placement);
      }
      editor.dispatch({ effects: setSuggestionPlacements.of(placed) });
      setSuggestions(waiting);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(id: Uuid) {
    try {
      await api.deleteThread(projectId, id);
      setThreads((current) => current.filter((t) => t.conversation_id !== id));
      const rest = new Map(view.current?.state.field(threadPlacements));
      rest.delete(id);
      place(rest);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** Selects a thread's card, bringing its passage into view when it has one. */
  function selectThread(id: Uuid) {
    setSelected(id);
    const placement = placements.get(id);
    if (placement) {
      view.current?.dispatch({
        effects: EditorView.scrollIntoView(placement.from, { y: "center" }),
      });
    }
  }

  /** Hides the comments sheet, which leaves the selected thread. */
  function hideComments() {
    setSelected(null);
    setShowComments(false);
  }

  async function refreshThreads() {
    try {
      setThreads(await api.listThreads(projectId, assetId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function exportPdf() {
    // A PDF made after a failed save would hold the older text; the save's error stays shown.
    if (!(await save())) return;
    setExporting(true);
    setExported(null);
    try {
      setExported(await api.exportDocumentPdf(projectId, assetId));
      setShowExported(true);
      setError(null);
    } catch (e) {
      setError(`The PDF was not made: ${errorMessage(e)}`);
    } finally {
      setExporting(false);
    }
  }

  const edit = (change: (editor: EditorView) => void) => {
    const editor = view.current;
    if (!editor || drafting) return;
    change(editor);
    editor.focus();
  };

  const authorName = (suggestion: Suggestion) =>
    miniMes.find((m) => m.id === suggestion.author.id)?.name ?? "a Mini-Me";
  const detached = suggestions.filter((s) => suggestionsPlaced.get(s.id) === null);
  const shown = suggestions.find((s) => s.id === chosen?.id);

  const title = headerField(text, "title") || "Untitled document";
  const subtitle = editedAt !== null ? `Edited ${formatRelative(editedAt)}` : undefined;

  return (
    // The comments sheet floats beside the document's sheet, like a Conversation's tool sheets.
    <>
      <MainSheet>
        <div className="flex min-h-0 flex-1 flex-col">
          <EditorHeader
            title={title}
            subtitle={subtitle}
            back={back}
            actions={
              <>
                <Button
                  variant={showComments ? "default" : "secondary"}
                  aria-pressed={showComments}
                  disabled={blocked}
                  onClick={() => (showComments ? hideComments() : setShowComments(true))}
                >
                  <MessageSquareTextIcon />
                  Comments
                </Button>
                <Button
                  variant="secondary"
                  disabled={rendering || drafting || blocked}
                  onClick={() => void render(text)}
                >
                  <RefreshCwIcon className={cn(rendering && "animate-spin")} />
                  {rendering ? "Rendering…" : "Render"}
                </Button>
                {/* Says where the PDF went once it is made; clicking outside closes it. */}
                <Popover
                  open={showExported}
                  onOpenChange={(open) => !open && setShowExported(false)}
                >
                  <PopoverTrigger
                    render={<Button variant="secondary" disabled={drafting || exporting || blocked} />}
                    onClick={exportPdf}
                  >
                    <FileDownIcon />
                    {exporting ? "Exporting…" : "Export PDF"}
                  </PopoverTrigger>
                  <PopoverContent align="end">
                    <p>Saved {exported?.name} to Files.</p>
                    <div className="flex justify-end">
                      <Button
                        onClick={() => {
                          setShowExported(false);
                          if (exported) void api.openAsset(projectId, exported.id).catch(() => {});
                        }}
                      >
                        Open
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            }
            problems={error}
            onBack={onClose}
          />
          <div className={cn(BAR, blocked && "hidden")}>
            <SourceButton
              label="Bold"
              disabled={drafting}
              onClick={() => edit((e) => wrapSelection(e, "**"))}
            >
              <BoldIcon />
            </SourceButton>
            <SourceButton
              label="Italic"
              disabled={drafting}
              onClick={() => edit((e) => wrapSelection(e, "*"))}
            >
              <ItalicIcon />
            </SourceButton>
            <SourceButton
              label="Heading 1"
              disabled={drafting}
              onClick={() => edit((e) => blockPrefix(e, "# "))}
            >
              <Heading1Icon />
            </SourceButton>
            <SourceButton
              label="Heading 2"
              disabled={drafting}
              onClick={() => edit((e) => blockPrefix(e, "## "))}
            >
              <Heading2Icon />
            </SourceButton>
            <SourceButton
              label="Quote"
              disabled={drafting}
              onClick={() => edit((e) => blockPrefix(e, "> "))}
            >
              <QuoteIcon />
            </SourceButton>
            <SourceButton
              label="Bulleted list"
              disabled={drafting}
              onClick={() => edit((e) => blockPrefix(e, "- "))}
            >
              <ListIcon />
            </SourceButton>
            <Separator orientation="vertical" className="mx-1 h-5 self-center" />
            <SourceButton
              label="Comment on the selection"
              disabled={drafting || !hasSelection}
              onClick={() => void comment()}
            >
              <MessageSquarePlusIcon />
            </SourceButton>
            {previewError && (
              <span className="ml-auto text-meta text-muted-foreground">{previewError}</span>
            )}
          </div>
          <div className={cn("grid min-h-0 flex-1 grid-cols-2", blocked && "hidden")}>
            <section
              aria-label="Source"
              className="flex min-h-0 min-w-0 flex-col border-r border-border bg-muted"
            >
              {drafting && (
                <Card
                  role="status"
                  variant="outline"
                  size="sm"
                  className="mx-6 mt-4 flex-row items-center gap-3 py-2.5"
                >
                  <MiniMeAvatar miniMe={scribe} size={26} />
                  <span className="flex-1 text-ui text-foreground">Scribe is drafting…</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => draftId.current && void api.stopDraft(draftId.current)}
                  >
                    Stop
                  </Button>
                </Card>
              )}
              {detached.map((suggestion) => (
                <Card
                  key={suggestion.id}
                  variant="outline"
                  size="sm"
                  render={
                    <button
                      type="button"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setChosen({ id: suggestion.id, anchor: at(rect) });
                      }}
                    />
                  }
                  className="mx-6 mt-4 block cursor-pointer truncate py-2.5 text-left text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  A suggestion by {authorName(suggestion)} lost its passage: “{suggestion.text}”
                </Card>
              ))}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {/* The source as a page, like the preview's: clicking anywhere on it, even below
                    short text, puts the cursor in the editor. */}
                <div
                  ref={host}
                  onClick={() => view.current?.focus()}
                  className="flex min-h-full flex-col rounded-lg bg-card"
                />
              </div>
            </section>
            <section aria-label="Preview" className="flex min-h-0 min-w-0 flex-col bg-muted">
              <PreviewPages pages={pages} />
            </section>
          </div>
          {blocked && quarto && <QuartoNotice status={quarto} onCheck={recheckQuarto} />}
        </div>
      </MainSheet>
      {showComments && (
        <CommentsSheet
          projectId={projectId}
          text={text}
          threads={threads}
          placements={placements}
          open={selected}
          onOpen={(id) => (id ? selectThread(id) : setSelected(null))}
          onClose={hideComments}
          onActivity={() => {
            void refreshThreads();
            void refreshSuggestions();
          }}
          onResolve={(id, resolved) => void resolve(id, resolved)}
          // Cleared after the delete, so the thread is no longer there to be left empty.
          onDelete={(id) => void remove(id).then(() => setSelected(null))}
        />
      )}
      {chosen && shown && (
        <SuggestionPopover
          key={shown.id}
          anchor={chosen.anchor}
          author={authorName(shown)}
          text={shown.text}
          detached={suggestionsPlaced.get(shown.id) === null}
          onAccept={() => accept(shown.id)}
          onDiscard={() => discard(shown.id)}
          onClose={() => setChosen(null)}
        />
      )}
    </>
  );
}

/** A popover anchor fixed at `rect`, so it stays put when the source redraws what was clicked. */
const at = (rect: DOMRect): PopoverAnchor => ({ getBoundingClientRect: () => rect });

/** The preview's pages, each an SVG image drawn on a white page with the sheet's outline. */
function PreviewPages({ pages }: { pages: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made = pages.map((page) =>
      URL.createObjectURL(new Blob([page], { type: "image/svg+xml" })),
    );
    setUrls(made);
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, [pages]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto grid max-w-[640px] gap-4">
        {urls.map((url, index) => (
          <img
            key={url}
            src={url}
            alt={`Page ${index + 1}`}
            className="w-full rounded-lg bg-card"
          />
        ))}
      </div>
    </div>
  );
}

function SourceButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="text-ink-2"
    >
      {children}
    </Button>
  );
}
