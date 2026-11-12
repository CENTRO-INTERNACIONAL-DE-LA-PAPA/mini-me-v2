import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../../protocol/types";
import { surfaceStyle } from "./miniMeColors";

/** A card in a Mini-Me's wash that sets the `--mm-*` variables for its content; neutral without
 * a Mini-Me. */
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
        className: cn("rounded-card bg-wash [--card-edge:transparent]", className),
      },
      props,
    ),
    render,
  });
}
