import { Extension, type Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { api, errorCode, errorMessage } from "../../api";
import {
  assetTarget,
  componentTarget,
  draftFromDoc,
  fold,
  miniMeSuggestions,
  miniMeTarget,
  type ReferenceKind,
  type ReferenceTarget,
} from "../../protocol/references";
import type { AssetRef, Message, MiniMe } from "../../protocol/types";
import { AttachmentTray } from "./AttachmentTray";
import type { ComponentName } from "../interactive/component-names";
import { surfaceStyle } from "../minime/miniMeColors";
import { MiniMePill } from "../minime/MiniMePill";
import { ReferenceNode } from "./ReferenceNode";
import { sidecarReady, useSidecarStatus } from "../shell/SidecarStatusLine";
import { useMiniMes } from "../../hooks/useMiniMes";
import { Button } from "@/components/ui/button";
import {
  ArrowUpIcon,
  AtSignIcon,
  ChartColumnIcon,
  HashIcon,
  PaperclipIcon,
  SquareIcon,
  Table2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  conversationId: string;
  /** A reply is streaming or paused; sending waits until it ends. */
  replying: boolean;
  /** Mini-Me is deciding who answers the last message; sending waits until it has. */
  choosing: boolean;
  onSent: (message: Message) => void;
  /** The Conversation's tables and charts, newest first, for the `$` list. */
  components: ComponentName[];
  /** A tool sheet is open beside the Conversation, so the chat column is narrower. */
  narrow?: boolean;
  /** In a comment thread's card: placed in the card instead of floating over the sheet, and a
   * comment without an @-mention is a note. */
  thread?: boolean;
  ref?: Ref<ComposerHandle>;
}

/** The Conversation's chat column, centred in the sheet and narrower while a tool sheet is
 * open beside it. The composer spans it; the messages sit 20px inside it on each side. */
export function chatColumn(narrow: boolean, part: "composer" | "messages"): string {
  return cn(
    "mx-auto w-full",
    narrow ? "max-w-[752px]" : "max-w-[892px]",
    part === "composer" ? "px-9" : "px-14",
  );
}

/** What the rest of the Conversation can do to the composer. */
export interface ComposerHandle {
  /** Adds a reference at the end of the text, leaving the rest and the caret as they are. */
  appendReference: (target: ReferenceTarget) => void;
  /** Imports the files of a drop on the window and attaches them to the message. */
  attachDropped: (paths: string[]) => void;
}

/** An entry in the `@`, `#` or `$` list. */
interface Suggestion {
  target: ReferenceTarget;
  miniMe?: MiniMe;
  /** For a `$` entry, what the component is. */
  kind?: ComponentName["kind"];
}

/** The list being typed: its kind, the text after its sign, and how to insert a pick. */
interface Query {
  kind: ReferenceKind;
  query: string;
  pick: (target: ReferenceTarget) => void;
}

const SIGNS: Array<[string, ReferenceKind]> = [
  ["@", "mini_me"],
  ["#", "asset"],
  ["$", "component"],
];

/** A pasted image without the name browsers give any pasted bitmap (`image.png`), so the
 * core names it `Pasted image`; a copied file keeps its own name. */
function pastedFile(image: File): File {
  return /^image\.[a-z]+$/i.test(image.name) ? new File([image], "", { type: image.type }) : image;
}

/** Whether the document ends in a character after which a new reference needs a space. */
function endsInWord(editor: Editor): boolean {
  const last = editor.state.doc.lastChild?.lastChild;
  return last !== null && last !== undefined && !(last.isText && /\s$/.test(last.text ?? ""));
}

export function Composer({
  projectId,
  conversationId,
  replying,
  choosing,
  onSent,
  components,
  narrow = false,
  thread = false,
  ref,
}: Props) {
  const [attachments, setAttachments] = useState<AssetRef[]>([]);
  const [query, setQuery] = useState<Query | null>(null);
  const [assetSuggestions, setAssetSuggestions] = useState<AssetRef[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sidecar = useSidecarStatus();
  const ready = sidecarReady(sidecar);
  const miniMes = useMiniMes();
  // The editor's extensions are made once, so they reach the latest render through these.
  const listKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const enter = useRef<() => boolean>(() => false);
  const paste = useRef<(event: ClipboardEvent) => boolean>(() => false);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({
        placeholder: thread
          ? "Reply, or @ a Mini-Me…"
          : "Ask a Mini-Me, or type @ to choose one…",
      }),
      ReferenceNode.configure({
        suggestions: SIGNS.map(([char, kind]) => suggestion(char, kind)),
      }),
      Extension.create({
        name: "composerKeys",
        addKeyboardShortcuts: () => ({ Enter: () => enter.current() }),
      }),
    ],
    editorProps: {
      handlePaste: (_view, event) => paste.current(event),
      attributes: {
        "aria-label": "Message",
        class: cn(
          thread
            ? "max-h-32 min-h-7 overflow-y-auto px-2 py-1 text-ui outline-none"
            : "max-h-48 min-h-9 overflow-y-auto px-4 pt-3 pb-1 text-body outline-none",
          "wrap-break-word [scrollbar-gutter:stable]",
        ),
      },
    },
    onUpdate: () => setError(null),
  });

  /** One sign's list: its query and pick reach React state, and its keys go to the list. */
  function suggestion(char: string, kind: ReferenceKind): Partial<SuggestionOptions> {
    return {
      char,
      items: () => [],
      render: () => {
        const show = ({ query, command }: { query: string; command: (p: object) => void }) =>
          setQuery({ kind, query, pick: (target) => command(target) });
        return {
          onStart: show,
          onUpdate: show,
          onExit: () => setQuery(null),
          onKeyDown: ({ event }) => listKeys.current(event),
        };
      },
    };
  }

  const draft = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? draftFromDoc(editor.getJSON()) : null),
  });
  // The first Mini-Me the draft mentions answers it; without one, Mini-Me picks who answers.
  const mentioned = draft?.text_components.find((c) => c.kind === "mini_me");
  const asked = mentioned && miniMes.find((m) => m.id === mentioned.id);
  const empty = !draft?.content.trim();

  useEffect(() => {
    if (query?.kind !== "asset") {
      setAssetSuggestions([]);
      return;
    }
    let current = true;
    api
      .listAssets(projectId, query.query)
      .then((assets) => current && setAssetSuggestions(assets))
      .catch(() => current && setAssetSuggestions([]));
    return () => {
      current = false;
    };
  }, [projectId, query?.kind, query?.query]);

  useEffect(() => setHighlight(0), [query?.kind, query?.query]);

  const componentSuggestions: Suggestion[] =
    query?.kind === "component"
      ? components
          .filter((c) => fold(c.name).includes(fold(query.query)))
          .map((c) => ({ target: componentTarget(c.name, c.id), kind: c.kind }))
      : [];

  /** The list's sections: a heading (empty for files, tables and charts) and its entries. */
  const sections: Array<{ heading: string; entries: Suggestion[] }> =
    query?.kind === "mini_me"
      ? miniMeSuggestions(miniMes, query.query).map((section) => ({
          heading: section.label,
          entries: section.miniMes.map((m) => ({ target: miniMeTarget(m), miniMe: m })),
        }))
      : query?.kind === "component"
        ? componentSuggestions.length > 0
          ? [{ heading: "", entries: componentSuggestions }]
          : []
        : query?.kind === "asset" && assetSuggestions.length > 0
          ? [{ heading: "", entries: assetSuggestions.map((a) => ({ target: assetTarget(a) })) }]
          : [];
  const suggestions = sections.flatMap((section) => section.entries);

  listKeys.current = (event) => {
    if (!query || suggestions.length === 0) {
      return false;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      query.pick(suggestions[Math.min(highlight, suggestions.length - 1)].target);
      return true;
    }
    return false;
  };

  enter.current = () => {
    // While an input method is composing, Enter confirms its text.
    if (editor?.view.composing) {
      return false;
    }
    send();
    return true;
  };

  paste.current = (event) => {
    const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length === 0) {
      return false;
    }
    Promise.all(images.map((image) => api.importPastedImage(projectId, pastedFile(image))))
      .then((imported) => setAttachments((current) => [...current, ...imported]))
      .catch((e) => setError(errorMessage(e)));
    return true;
  };

  useImperativeHandle(
    ref,
    () => ({
      appendReference(target) {
        if (!editor) return;
        const reference = { type: "reference", attrs: target };
        const content = endsInWord(editor) ? [{ type: "text", text: " " }, reference] : [reference];
        const end = editor.state.doc.content.size - 1;
        editor.chain().insertContentAt(end, content, { updateSelection: false }).run();
      },
      attachDropped(paths) {
        api
          .importDropped(projectId, paths)
          .then((imported) => setAttachments((current) => [...current, ...imported]))
          .catch((e) => setError(errorMessage(e)));
      },
    }),
    [editor, projectId],
  );

  async function attach() {
    try {
      const imported = await api.importAssets(projectId);
      setAttachments((current) => [...current, ...imported]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function send() {
    if (!editor || replying || choosing || !ready) {
      return;
    }
    const message = draftFromDoc(editor.getJSON());
    if (!message.content.trim()) {
      return;
    }
    try {
      const sent = await api.sendMessage(projectId, conversationId, {
        ...message,
        attachments: attachments.map((a) => a.id),
      });
      editor.commands.clearContent(true);
      setAttachments([]);
      onSent(sent);
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
    if (!editor) return;
    const { from } = editor.state.selection;
    // A reference before the caret counts as a word, so the sign gets a space after it.
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, "\n", "x");
    const spaced = before !== "" && !/\s/.test(before);
    editor.chain().focus().insertContent(spaced ? ` ${sign}` : sign).run();
  }

  async function stop() {
    try {
      await api.stopReply(projectId, conversationId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const size = thread ? "size-7" : "size-[34px]";
  const action = replying ? (
    <Button
      size="icon"
      className={cn(size, "shrink-0 rounded-full", asked && "bg-(--mm-ink)")}
      aria-label="Stop the reply"
      title="Stop the reply"
      onClick={stop}
    >
      <SquareIcon className="size-3 fill-current" />
    </Button>
  ) : (
    <Button
      size="icon"
      className={cn(size, "shrink-0 rounded-full", asked && "bg-(--mm-ink)")}
      aria-label="Send"
      title="Send"
      onClick={send}
      disabled={empty || !ready || choosing}
    >
      <ArrowUpIcon />
    </Button>
  );

  return (
    // In a Conversation it floats over the bottom of the sheet, centred on the chat column; in a
    // comment thread's card it sits in place.
    <div
      className={cn(
        thread ? "relative" : "absolute inset-x-0 bottom-[22px] z-20",
        !thread && chatColumn(narrow, "composer"),
      )}
    >
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={
            query?.kind === "mini_me"
              ? "Mini-Mes"
              : query?.kind === "component"
                ? "Tables and charts"
                : "Files"
          }
          className={cn(
            "absolute bottom-full left-9 mb-2 max-h-80 w-80 overflow-y-auto rounded-well border",
            "border-border bg-popover p-1 text-popover-foreground",
          )}
        >
          {sections.map((section, index) => (
            <div key={index} role="group" aria-label={section.heading || undefined}>
              {section.heading && (
                <p className="px-2.5 pt-2 pb-1 text-meta text-muted-foreground">
                  {section.heading}
                </p>
              )}
              {section.entries.map((entry) => (
                <SuggestionRow
                  key={entry.target.id}
                  suggestion={entry}
                  selected={suggestions[highlight] === entry}
                  onPick={() => query?.pick(entry.target)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-meta text-destructive">{error}</p>}
      {!ready && sidecar && (
        <p role="status" className="mb-2 text-meta text-muted-foreground">
          {sidecar.detail}
        </p>
      )}
      {/* Addressed to a Mini-Me, the box is outlined in its edge colour and sends in its ink. */}
      {thread ? (
        <div
          style={surfaceStyle(asked?.colors)}
          className="rounded-control border border-edge bg-card p-1"
        >
          <AttachmentTray
            projectId={projectId}
            attachments={attachments}
            onRemove={(asset) => setAttachments((current) => current.filter((a) => a !== asset))}
          />
          <div className="flex items-end gap-1">
            <EditorContent editor={editor} className="composer-editor min-w-0 flex-1" />
            {action}
          </div>
        </div>
      ) : (
        <div
          style={surfaceStyle(asked?.colors)}
          className="rounded-composer border border-edge bg-card px-1.5 pt-1"
        >
          <AttachmentTray
            projectId={projectId}
            attachments={attachments}
            onRemove={(asset) => setAttachments((current) => current.filter((a) => a !== asset))}
          />
          <EditorContent editor={editor} className="composer-editor" />
          <div className="flex items-center gap-0.5 px-1 pb-2.5">
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
            {action}
          </div>
        </div>
      )}
    </div>
  );
}

/** One entry in the `@`, `#` or `$` list: a Mini-Me's pill and description, a table's or
 * chart's name, or a file name. */
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
        selected ? "bg-accent" : "hover:bg-accent",
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
              "text-muted-foreground",
            )}
          >
            {suggestion.miniMe.description}
          </span>
        </>
      ) : suggestion.kind ? (
        <span className="flex items-center gap-1.5 text-ui">
          {suggestion.kind === "chart" ? (
            <ChartColumnIcon aria-label="Chart" className="size-3.5 shrink-0" />
          ) : (
            <Table2Icon aria-label="Table" className="size-3.5 shrink-0" />
          )}
          {suggestion.target.label}
        </span>
      ) : (
        <span className="text-ui">{suggestion.target.label}</span>
      )}
    </button>
  );
}
