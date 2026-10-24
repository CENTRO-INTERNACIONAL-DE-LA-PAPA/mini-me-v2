import { mergeAttributes } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { ReferenceTarget } from "../protocol/references";
import { TextComponentChip } from "./TextComponentChip";
import { useMiniMes } from "./useMiniMes";

/** A data attribute holding one of the reference's attributes, so a copied chip pastes back
 * into the editor as a chip. */
const dataAttribute = (name: string) => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`),
  renderHTML: (attributes: Record<string, unknown>) => ({ [`data-${name}`]: attributes[name] }),
});

/** A picked reference in the composer: one inline block holding a Text Component's kind, ID
 * and label. Its text, when copied or sent, is its label. */
export const ReferenceNode = Mention.extend({
  name: "reference",
  addAttributes() {
    return { kind: dataAttribute("kind"), id: dataAttribute("id"), label: dataAttribute("label") };
  },
  renderHTML({ node, HTMLAttributes }) {
    const attributes = mergeAttributes({ "data-type": this.name }, HTMLAttributes);
    return ["span", attributes, String(node.attrs.label ?? "")];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReferenceView, { as: "span" });
  },
}).configure({
  deleteTriggerWithBackspace: true,
  renderText: ({ node }) => String(node.attrs.label ?? ""),
});

function ReferenceView({ node }: ReactNodeViewProps) {
  const miniMes = useMiniMes();
  const { kind, id, label } = node.attrs as ReferenceTarget;
  return (
    <NodeViewWrapper as="span" className="composer-chip">
      <TextComponentChip
        component={{ kind, id, label, start: 0, end: label.length }}
        miniMes={miniMes}
      >
        {label}
      </TextComponentChip>
    </NodeViewWrapper>
  );
}
