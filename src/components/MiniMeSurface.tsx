import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../protocol/types";
import { surfaceStyle } from "./miniMeColors";

/**
 * A card in a Mini-Me's colour: its wash, outlined in its edge, with the `--mm-*` variables
 * set for what is inside it (its ink text, white buttons outlined in its edge). Without a
 * Mini-Me it is a neutral card. Replies, handed-back tasks, running jobs and library cards
 * are drawn on it.
 */
export function MiniMeSurface({
  miniMe,
  className,
  style,
  render,
  ...props
}: useRender.ComponentProps<"div"> & { miniMe?: MiniMe }) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        style: { ...surfaceStyle(miniMe?.colors), ...style },
        className: cn("rounded-card border border-edge bg-wash", className),
      },
      props,
    ),
    render,
  });
}
