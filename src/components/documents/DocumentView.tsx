import { Button } from "@/components/ui/button";
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
import { formatRelative } from "../../lib/format";
import type { AssetRef, CommentThread, Uuid } from "../../protocol/types";
import { EditorHeader } from "../library/LibraryParts";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MainSheet } from "../shell/Sheet";
import {
  placeThreads,
  savedAnchors,
  setPlacements,
  threadPlacements,
  type Placement,
} from "./anchors";
import { CommentsSheet, threadsInOrder } from "./CommentsSheet";
import { setHighlighted, threadAt, threadHighlights } from "./highlights";
import { headerField } from "./qmd";
import { blockPrefix, wrapSelection } from "./sourceEdits";

/** How long typing must pause before a document is saved. */
const SAVE_DELAY_MS = 1000;
/** How often the source shows newly drafted text. */
const DRAFT_REFRESH_MS = 250;

/** The bar over the source and the preview: the formatting buttons, and the preview's state. */
const BAR = "mt-5 flex h-11 shrink-0 items-center gap-0.5 border-y border-border bg-background px-4";

interface Props {
  projectId: Uuid;
  projectName: string;
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

/** A document across the whole main sheet: its Quarto source, edited and saved as the user
 * types, beside either a preview rendered by the same engine as the PDF export or the comment
 * threads on its passages. A document being drafted fills as Scribe writes and can be edited
 * once the draft ends. */
export function DocumentView({ projectId, projectName, assetId, back, draftFrom, onClose }: Props) {
  const [text, setText] = useState("");
  const [editedAt, setEditedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(Boolean(draftFrom));
  const [exported, setExported] = useState<AssetRef | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [rendered, setRendered] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [placements, setPlacementsShown] = useState<ReadonlyMap<Uuid, Placement>>(new Map());
  const [selected, setSelected] = useState<Uuid | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const scribe = useMiniMes().find((m) => m.name === "Scribe");

  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const pending = useRef<number | null>(null);
  const draftId = useRef<string | null>(null);
  // Set while the source is replaced by code, so the change is not saved as an edit.
  const loading = useRef(false);

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

  const replace = (next: string) => {
    const editor = view.current;
    if (!editor) return;
    loading.current = true;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: next } });
    loading.current = false;
    setText(next);
  };

  const setEditable = (on: boolean) =>
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(on)) });

  const render = useCallback(async (source: string) => {
    setRendering(true);
    try {
      setPages(await api.previewDocument(source));
      setRendered(source);
      setPreviewError(null);
    } catch (e) {
      setPreviewError(errorMessage(e));
    } finally {
      setRendering(false);
    }
  }, []);

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
          threadHighlights,
          EditorView.domEventHandlers({
            // A bubble opens its thread instead of moving the cursor.
            mousedown: (event) => {
              const bubble = (event.target as Element).closest<HTMLElement>(".cm-comment-bubble");
              if (!bubble?.dataset.thread) return false;
              setSelected(bubble.dataset.thread);
              setShowComments(true);
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            const placed = update.state.field(threadPlacements);
            if (placed !== update.startState.field(threadPlacements)) setPlacementsShown(placed);
            if (update.selectionSet) {
              setHasSelection(!update.state.selection.main.empty);
              const clicked = update.transactions.some((t) => t.isUserEvent("select.pointer"));
              const at = update.state.selection.main.head;
              const thread = clicked ? threadAt(update.state, at) : null;
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
      if (!active) return;
      replace(source);
      setThreads(found);
      view.current?.dispatch({ effects: setPlacements.of(placeThreads(source, found)) });
      if (modified_at !== null) setEditedAt(modified_at);
      setEditable(true);
      void render(source);
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

  // The source shows the open threads with their numbers, and the selected one's passage
  // highlighted.
  useEffect(() => {
    const open = threadsInOrder(threads, placements, false);
    const visible = new Set(open.map((t) => t.conversation_id));
    const numbers = new Map(open.map((t, index) => [t.conversation_id, index + 1]));
    view.current?.dispatch({ effects: setHighlighted.of({ visible, selected, numbers }) });
  }, [threads, placements, selected]);

  // A thread left before its first comment was never used, so it goes.
  const previous = useRef<Uuid | null>(null);
  useEffect(() => {
    const left = previous.current;
    previous.current = selected;
    const thread = threads.find((t) => t.conversation_id === left);
    if (left && left !== selected && thread?.comments === 0) void remove(left);
  }, [selected]);

  /** Places `next` as the threads' placements in the source. */
  const place = (next: Map<Uuid, Placement>) =>
    view.current?.dispatch({ effects: setPlacements.of(next) });

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

  const title = headerField(text, "title") || "Untitled document";
  const stale = rendered !== null && rendered !== text;
  const subtitle = [
    "Draft",
    projectName,
    editedAt !== null ? `edited ${formatRelative(editedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
                  onClick={() => (showComments ? hideComments() : setShowComments(true))}
                >
                  <MessageSquareTextIcon />
                  Comments
                </Button>
                <Button
                  variant="secondary"
                  disabled={rendering || drafting}
                  onClick={() => void render(text)}
                >
                  <RefreshCwIcon />
                  {rendering ? "Rendering…" : "Render"}
                </Button>
                <Button variant="secondary" onClick={exportPdf} disabled={drafting || exporting}>
                  <FileDownIcon />
                  {exporting ? "Exporting…" : "Export PDF"}
                </Button>
              </>
            }
            problems={error}
            onBack={onClose}
          />
          {exported && (
            <p className="flex items-center gap-2 px-8 pt-3 text-meta text-muted-foreground">
              Saved {exported.name} to Files.
              <Button
                variant="link"
                size="sm"
                className="text-meta"
                onClick={() => void api.openAsset(projectId, exported.id).catch(() => {})}
              >
                Open
              </Button>
            </p>
          )}
          <div className={BAR}>
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
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            <SourceButton
              label="Comment on the selection"
              disabled={drafting || !hasSelection}
              onClick={() => void comment()}
            >
              <MessageSquarePlusIcon />
            </SourceButton>
            <span className="ml-auto text-meta text-muted-foreground">
              {previewError ?? (stale ? "The preview is out of date: Render to update it." : "")}
            </span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2">
            <section
              aria-label="Source"
              className="flex min-h-0 min-w-0 flex-col border-r border-border bg-muted"
            >
              {drafting && (
                <div
                  role="status"
                  className="mx-6 mt-4 flex items-center gap-3 rounded-card border border-border bg-card px-4 py-2.5"
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
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {/* The source as a page, like the preview's: clicking anywhere on it, even below
                    short text, puts the cursor in the editor. */}
                <div
                  ref={host}
                  onClick={() => view.current?.focus()}
                  className="flex min-h-full flex-col rounded-control border border-border bg-card"
                />
              </div>
            </section>
            <section aria-label="Preview" className="flex min-h-0 min-w-0 flex-col bg-muted">
              <PreviewPages pages={pages} />
            </section>
          </div>
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
          onActivity={() => void refreshThreads()}
          onResolve={(id, resolved) => void resolve(id, resolved)}
          // Cleared after the delete, so the thread is no longer there to be left empty.
          onDelete={(id) => void remove(id).then(() => setSelected(null))}
        />
      )}
    </>
  );
}

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
            className="w-full rounded-control border border-border bg-card"
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
