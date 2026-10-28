import { Component as ReactComponent, type ReactNode } from "react";
import type { Component, MessageStatus } from "../../protocol/types";
import { rendererFor } from "./catalogue";

/** A component's plain-text version, shown when its kind or version has no renderer here
 * or its renderer fails. */
function Fallback({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-card border border-edge px-4 py-3 text-ui text-ink-2 whitespace-pre-wrap wrap-anywhere">
      {text}
    </div>
  );
}

interface BoundaryProps {
  text: string;
  children: ReactNode;
}

class RenderBoundary extends ReactComponent<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <Fallback text={this.props.text} /> : this.props.children;
  }
}

interface Props {
  component: Component;
  projectId?: string;
  messageId?: string;
  replyStatus?: MessageStatus;
  /** The solid colour of the Mini-Me that wrote the reply, when known. */
  color?: string;
}

/** One Interactive Component, drawn by its kind's renderer for its version. */
export function InteractiveComponent({
  component,
  projectId,
  messageId,
  replyStatus,
  color,
}: Props) {
  const Renderer = rendererFor(component.kind, component.version);
  if (!Renderer) {
    return <Fallback text={component.text} />;
  }
  return (
    <RenderBoundary text={component.text}>
      <Renderer
        data={component.data}
        answer={component.answer}
        projectId={projectId}
        messageId={messageId}
        componentId={component.id}
        replyStatus={replyStatus}
        color={color}
      />
    </RenderBoundary>
  );
}
