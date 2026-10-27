import { createElement, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { markdownSource } from "../protocol/references";
import type { MiniMe, TextComponent } from "../protocol/types";
import { openLink, webUrl } from "./interactive/links";
import { TextComponentChip } from "./TextComponentChip";

interface Props {
  content: string;
  textComponents?: TextComponent[];
  miniMes?: MiniMe[];
  onOpenAsset?: (assetId: string) => void;
  /** `body` for a reply, `ui` for the smaller text of an opened Step output. */
  size?: "body" | "ui";
}

/** A Markdown syntax tree node, as far as `htmlAsText` needs one. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** Node types whose children are blocks, where a bare text node needs a paragraph. */
const BLOCK_PARENTS = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

/** A remark plugin that shows raw HTML as the text it is, instead of dropping it. */
function htmlAsText() {
  const walk = (node: MdNode) => {
    node.children = node.children?.map((child) => {
      if (child.type !== "html") {
        walk(child);
        return child;
      }
      const text = { type: "text", value: child.value ?? "" };
      return BLOCK_PARENTS.has(node.type) ? { type: "paragraph", children: [text] } : text;
    });
  };
  return walk;
}

// `htmlAsText` runs before `remarkBreaks`, so that the line breaks of raw HTML shown as text
// become breaks too.
const REMARK_PLUGINS = [remarkGfm, htmlAsText, remarkBreaks];

/** `href` when a link may open it: a web address, or an email address to write to. */
const openable = (href: string | undefined) =>
  href && /^mailto:/i.test(href) ? href : webUrl(href);

const NO_TEXT_COMPONENTS: TextComponent[] = [];
const NO_MINI_MES: MiniMe[] = [];

/** Keeps `ref:` links, which stand for Text Components; other URLs get the default check. */
const urlTransform = (url: string) => (url.startsWith("ref:") ? url : defaultUrlTransform(url));

function link(href: string | undefined, children: ReactNode) {
  const url = openable(href);
  if (!url) {
    return <span>{children}</span>;
  }
  return (
    <a
      href={url}
      className="underline underline-offset-2 hover:opacity-70"
      onClick={(event) => {
        event.preventDefault();
        openLink(url);
      }}
    >
      {children}
    </a>
  );
}

/** An element override that sets `className` and drops react-markdown's syntax tree `node`. */
const styled = (tag: string, className: string) =>
  function Styled({ node: _node, ...props }: { node?: unknown }) {
    return createElement(tag, { ...props, className });
  };

// Headings and links take the surrounding text's colour, which an opened Step output mutes.
const HEADING = "mt-3 font-semibold first:mt-0";

const ELEMENTS: Components = {
  p: styled("p", "mt-2 first:mt-0"),
  h1: styled("h1", `${HEADING} text-lead`),
  h2: styled("h2", `${HEADING} text-section`),
  h3: styled("h3", HEADING),
  h4: styled("h4", HEADING),
  h5: styled("h5", HEADING),
  h6: styled("h6", HEADING),
  ul: styled("ul", "mt-2 list-disc pl-5 first:mt-0"),
  ol: styled("ol", "mt-2 list-decimal pl-5 first:mt-0"),
  li: styled("li", "mt-1 first:mt-0 [&>ol]:mt-1 [&>ul]:mt-1"),
  blockquote: styled("blockquote", "mt-2 border-l-2 border-border pl-3 first:mt-0"),
  hr: styled("hr", "my-3 border-border"),
  code: styled("code", "rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]"),
  pre: styled(
    "pre",
    "mt-2 overflow-x-auto rounded-sm bg-muted p-3 font-mono text-[13px] leading-normal " +
      "first:mt-0 [&_code]:bg-transparent [&_code]:p-0",
  ),
  table: ({ node: _node, ...props }) => (
    <div className="mt-2 overflow-x-auto rounded-xl bg-card border border-edge first:mt-0">
      <table className="w-full border-collapse text-ui tabular-nums" {...props} />
    </div>
  ),
  thead: styled("thead", "bg-muted"),
  th: styled("th", "px-3 py-2 text-left text-meta font-normal text-muted-foreground"),
  td: styled("td", "border-t border-border px-3 py-2"),
  img: ({ src, alt }) => link(typeof src === "string" ? src : undefined, alt || src || "image"),
};

/**
 * A Mini-Me's text rendered as Markdown: raw HTML is shown as text, images as links, links
 * open in the browser, and Text Components stay chips.
 */
export const Markdown = memo(
  function Markdown({
    content,
    textComponents = NO_TEXT_COMPONENTS,
    miniMes = NO_MINI_MES,
    onOpenAsset,
    size = "body",
  }: Props) {
    const source = useMemo(
      () => markdownSource(content, textComponents),
      [content, textComponents],
    );
    const components = useMemo<Components>(
      () => ({
        ...ELEMENTS,
        a: ({ href, children }) => {
          const reference = href?.startsWith("ref:")
            ? textComponents[Number(href.slice(4))]
            : undefined;
          return reference ? (
            <TextComponentChip
              component={reference}
              miniMes={miniMes}
              onOpenAsset={(id) => onOpenAsset?.(id)}
            >
              {reference.label}
            </TextComponentChip>
          ) : (
            link(href, children)
          );
        },
      }),
      [textComponents, miniMes, onOpenAsset],
    );
    return (
      <div className={cn("wrap-anywhere", size === "body" ? "text-body" : "text-ui")}>
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          urlTransform={urlTransform}
          components={components}
        >
          {source}
        </ReactMarkdown>
      </div>
    );
  },
  // `onOpenAsset` is left out: it only changes with its message's re-render, and every
  // instance of it opens the same Asset in the same Project, so a finished reply isn't parsed
  // again.
  (before, after) =>
    before.content === after.content &&
    before.textComponents === after.textComponents &&
    before.miniMes === after.miniMes &&
    before.size === after.size,
);
