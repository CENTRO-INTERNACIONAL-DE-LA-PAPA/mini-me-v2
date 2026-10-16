import { Component as ReactComponent, type ReactNode } from "react";
import type { Component } from "../../protocol/types";
import { rendererFor } from "./catalogue";

/** A component's plain-text version, shown when its kind or version has no renderer here
 * or its renderer fails. */
function Fallback({ text }: { text: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3 text-ui text-ink-2 whitespace-pre-wrap wrap-anywhere">
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

/** One Interactive Component, drawn by its kind's renderer for its version. */
export function InteractiveComponent({ component }: { component: Component }) {
  const Renderer = rendererFor(component.kind, component.version);
  if (!Renderer) {
    return <Fallback text={component.text} />;
  }
  return (
    <RenderBoundary text={component.text}>
      <Renderer data={component.data} />
    </RenderBoundary>
  );
}
