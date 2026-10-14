import { useState } from "react";
import { api, errorMessage } from "../api";
import type { MessageView } from "../protocol/eventStore";
import { segments } from "../protocol/references";
import { formatSize } from "./format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const fromUser = message.author.kind === "user";

  return (
    <article
      className={cn(
        "group/message flex flex-col gap-2",
        fromUser
          ? "max-w-[560px] self-end rounded-[14px_14px_4px_14px] border border-border px-4 py-3"
          : "text-ink-2",
      )}
    >
      <header className="flex items-baseline gap-2 text-meta">
        <strong className="text-[14.5px] font-semibold text-foreground">{authorName(message)}</strong>
        {status && (
          <span className={message.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
            {status}
          </span>
        )}
      </header>
      <p className="text-body whitespace-pre-wrap wrap-anywhere">
        {segments(message.content, message.text_components).map((segment, index) =>
          segment.component ? (
            <Badge
              key={index}
              variant="secondary"
              title="Open file"
              className="cursor-pointer align-baseline"
              render={<button onClick={() => open(segment.component!.id)} />}
            >
              {segment.text}
            </Badge>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </p>
      {message.status === "streaming" && message.progress && (
        <p role="status" className="text-meta text-muted-foreground">
          {message.progress.label}
          {message.progress.fraction !== null && ` · ${Math.round(message.progress.fraction * 100)}%`}
        </p>
      )}
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.attachments.map((asset) => (
            <Badge
              key={asset.id}
              variant="secondary"
              className="cursor-pointer"
              render={<button onClick={() => open(asset.id)} />}
            >
              {asset.name} · {formatSize(asset.size_bytes)}
            </Badge>
          ))}
        </div>
      )}
      <footer className="flex items-center gap-1">
        {[...counts].map(([emoji, count]) => (
          <Button
            key={emoji}
            size="xs"
            variant="outline"
            aria-pressed={mine(emoji)}
            className="rounded-full"
            onClick={() => toggle(emoji)}
          >
            {emoji} {count}
          </Button>
        ))}
        <span className="flex gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
          {QUICK_REACTIONS.filter((emoji) => !counts.has(emoji)).map((emoji) => (
            <Button key={emoji} size="xs" variant="ghost" onClick={() => toggle(emoji)}>
              {emoji}
            </Button>
          ))}
        </span>
      </footer>
      {error && <p className="text-meta text-destructive">{error}</p>}
    </article>
  );
}
