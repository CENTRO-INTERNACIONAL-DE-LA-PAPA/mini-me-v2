import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, errorCode, errorMessage } from "../api";
import {
  activeQuery,
  assetTarget,
  insertReference,
  miniMeTarget,
  toTextComponents,
  updateReferences,
  type DraftReference,
  type ReferenceKind,
  type ReferenceTarget,
} from "../protocol/references";
import type { AssetRef, Message } from "../protocol/types";
import { formatSize } from "./format";
import { sidecarReady, useSidecarStatus } from "./SidecarStatusLine";
import { useMiniMes } from "./useMiniMes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  projectId: string;
  conversationId: string;
  replying: boolean;
  /** Mini-Me is deciding who answers the last message; sending waits until it has. */
  choosing: boolean;
  onSent: (message: Message) => void;
}

export function Composer({ projectId, conversationId, replying, choosing, onSent }: Props) {
  const [text, setText] = useState("");
  const [references, setReferences] = useState<DraftReference[]>([]);
  const [attachments, setAttachments] = useState<AssetRef[]>([]);
  const [query, setQuery] = useState<{ start: number; query: string; kind: ReferenceKind } | null>(
    null,
  );
  const [assetSuggestions, setAssetSuggestions] = useState<AssetRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sidecar = useSidecarStatus();
  const ready = sidecarReady(sidecar);
  const miniMes = useMiniMes();

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

  const suggestions: ReferenceTarget[] =
    query?.kind === "mini_me"
      ? miniMes
          .filter((m) => m.name.toLowerCase().includes(query.query.toLowerCase()))
          .map(miniMeTarget)
      : assetSuggestions.map(assetTarget);

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
    if (query && suggestions.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      pick(suggestions[0]);
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
        <ul className="absolute bottom-full left-8 grid min-w-60 gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-float">
          {suggestions.map((target) => (
            <li key={target.id}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-md font-normal"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(target)}
              >
                {target.label}
              </Button>
            </li>
          ))}
        </ul>
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
        <Textarea
          ref={input}
          value={text}
          rows={2}
          className="max-h-48 min-h-9 flex-1 resize-none rounded-2xl border-border-composer text-body shadow-composer"
          placeholder="Write a message. Type @ to ask a Mini-Me, # to reference a file."
          onChange={(e) => edit(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onSelect={(e) =>
            setQuery(queryAt(e.currentTarget.value, e.currentTarget.selectionStart, references))
          }
        />
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
