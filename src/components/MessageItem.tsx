import { useState } from "react";
import { api, errorMessage } from "../api";
import type { MessageView } from "../protocol/eventStore";
import { segments } from "../protocol/references";
import { formatSize } from "./format";

const QUICK_REACTIONS = ["👍", "❤️", "🎉", "🤔", "👎"];

const STATUS_LABEL: Record<string, string | undefined> = {
  streaming: "Replying…",
  cancelled: "Stopped",
  failed: "Failed",
};

interface Props {
  projectId: string;
  message: MessageView;
}

function authorName(message: MessageView): string {
  switch (message.author.kind) {
    case "user":
      return "You";
    case "system":
      return message.author.id === "echo" ? "Echo" : "System";
    default:
      return "Mini-Me";
  }
}

export function MessageItem({ projectId, message }: Props) {
  const [error, setError] = useState<string | null>(null);

  // Each installation has one user, so every `user` reaction belongs to the local user.
  const mine = (emoji: string) =>
    message.reactions.some((r) => r.emoji === emoji && r.by.kind === "user");

  const counts = new Map<string, number>();
  for (const reaction of message.reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }

  async function toggle(emoji: string) {
    try {
      if (mine(emoji)) {
        await api.removeReaction(projectId, message.id, emoji);
      } else {
        await api.addReaction(projectId, message.id, emoji);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function open(assetId: string) {
    try {
      await api.openAsset(projectId, assetId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const status = STATUS_LABEL[message.status];

  return (
    <article className={`message ${message.author.kind}`}>
      <header>
        <strong>{authorName(message)}</strong>
        {status && <span className={`status ${message.status}`}>{status}</span>}
      </header>
      <p className="content">
        {segments(message.content, message.text_components).map((segment, index) =>
          segment.component ? (
            <button
              key={index}
              className="chip"
              title="Open file"
              onClick={() => open(segment.component!.id)}
            >
              {segment.text}
            </button>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </p>
      {message.attachments.length > 0 && (
        <div className="attachments">
          {message.attachments.map((asset) => (
            <button key={asset.id} className="chip" onClick={() => open(asset.id)}>
              {asset.name} · {formatSize(asset.size_bytes)}
            </button>
          ))}
        </div>
      )}
      <footer className="reactions">
        {[...counts].map(([emoji, count]) => (
          <button
            key={emoji}
            className={mine(emoji) ? "reaction mine" : "reaction"}
            onClick={() => toggle(emoji)}
          >
            {emoji} {count}
          </button>
        ))}
        <span className="quick">
          {QUICK_REACTIONS.filter((emoji) => !counts.has(emoji)).map((emoji) => (
            <button key={emoji} className="reaction" onClick={() => toggle(emoji)}>
              {emoji}
            </button>
          ))}
        </span>
      </footer>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
