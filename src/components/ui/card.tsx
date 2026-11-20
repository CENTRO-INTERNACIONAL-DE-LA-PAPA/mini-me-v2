import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// `default` is the neutral card on the sheet; `outline` is the white card, outlined in
// `--card-edge`. The card pads its content; a card with full-width parts sets `p-0`.
const cardVariants = cva(
  "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl p-(--card-spacing) text-ui text-card-foreground [--card-spacing:--spacing(5)] data-[size=sm]:[--card-spacing:--spacing(4)]",
  {
    variants: {
      variant: {
        default: "bg-muted [--card-edge:transparent]",
        outline: "border border-card-edge bg-card",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// `render` draws the card as another element, such as a button for a card that opens
// something.
function Card({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & { size?: "default" | "sm" }) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(cardVariants({ variant }), className),
      },
      props
    ),
    render,
    state: { slot: "card", size },
  })
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-center gap-3", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-ui font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center text-meta text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle }
