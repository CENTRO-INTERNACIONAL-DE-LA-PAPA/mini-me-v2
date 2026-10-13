import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, errorCode, errorMessage } from "../api";
import {
  activeQuery,
  insertReference,
  toTextComponents,
  updateReferences,
  type DraftReference,
} from "../protocol/references";
import type { AssetRef } from "../protocol/types";
import { formatSize } from "./format";

interface Props {
  projectId: string;
  conversationId: string;
  replying: boolean;
  onSent: () => void;
}

export function Composer({ projectId, conversationId, replying, onSent }: Props) {
  const [text, setText] = useState("");
  const [references, setReferences] = useState<DraftReference[]>([]);
  const [attachments, setAttachments] = useState<AssetRef[]>([]);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<AssetRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    let current = true;
    api
      .listAssets(projectId, query.query)
      .then((assets) => current && setSuggestions(assets.slice(0, 8)))
      .catch(() => current && setSuggestions([]));
    return () => {
      current = false;
    };
  }, [projectId, query]);

  /** The `#query` at the cursor, unless the `#` belongs to an existing reference. */
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

  function pick(asset: AssetRef) {
    if (!query) {
      return;
    }
    const cursor = input.current?.selectionStart ?? text.length;
    const result = insertReference(text, references, query.start, cursor, asset);
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
    if (!text.trim() || replying) {
      return;
    }
    try {
      await api.sendMessage(projectId, conversationId, {
        content: text,
        attachments: attachments.map((a) => a.id),
        text_components: toTextComponents(references),
      });
      setText("");
      setReferences([]);
      setAttachments([]);
      setQuery(null);
      onSent();
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
    <div className="composer">
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((asset) => (
            <li key={asset.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(asset)}>
                #{asset.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((asset) => (
            <span key={asset.id} className="chip">
              {asset.name} · {formatSize(asset.size_bytes)}
              <button
                className="link"
                aria-label={`Remove ${asset.name}`}
                onClick={() => setAttachments((current) => current.filter((a) => a.id !== asset.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="composer-row">
        <button onClick={attach} title="Attach files">
          Attach
        </button>
        <textarea
          ref={input}
          value={text}
          rows={2}
          placeholder="Write a message. Type # to reference a file in this Project."
          onChange={(e) => edit(e.target.value, e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onSelect={(e) =>
            setQuery(queryAt(e.currentTarget.value, e.currentTarget.selectionStart, references))
          }
        />
        {replying ? (
          <button className="danger" onClick={stop}>
            Stop
          </button>
        ) : (
          <button onClick={send} disabled={!text.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
