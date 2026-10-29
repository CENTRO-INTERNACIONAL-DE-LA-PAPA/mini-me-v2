import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-ui font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        // Floating sheets group with fills, not borders: outline and secondary are both a well.
        outline:
          "bg-well text-foreground hover:bg-well-hover aria-expanded:bg-well-hover aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        secondary:
          "bg-well text-secondary-foreground hover:bg-well-hover aria-expanded:bg-well-hover aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        // Inside a Mini-Me's surface: white with a ring in its edge colour (`--mm-edge`); a
        // hairline ring elsewhere.
        "mini-me":
          "bg-card text-foreground border border-card-edge hover:bg-wash aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:shadow-none",
        ghost:
          "text-ink-2 hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        destructive: "bg-transparent text-destructive hover:opacity-70",
        link: "h-auto! px-0! text-foreground hover:opacity-70",
      },
      size: {
        default: "h-9 gap-1.5 px-4",
        xs: "h-6 gap-1 px-2.5 text-meta [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-control",
        lg: "h-10 gap-2 px-5",
        icon: "size-[30px] rounded-control",
        "icon-xs": "size-6 rounded-control [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 rounded-control",
        "icon-lg": "size-9 rounded-control",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
