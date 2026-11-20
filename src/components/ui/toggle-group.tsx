import { createContext, useContext } from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cn } from "@/lib/utils"
import { tabSwitchOption, tabSwitchTrack } from "@/components/ui/tabs"

// `switch` is the tab switch; `plain` leaves the look to the items, such as colour swatches.
type Variant = "switch" | "plain"

const VariantContext = createContext<Variant>("switch")

function ToggleGroup({
  className,
  variant = "switch",
  ...props
}: ToggleGroupPrimitive.Props & { variant?: Variant }) {
  return (
    <VariantContext.Provider value={variant}>
      <ToggleGroupPrimitive
        data-slot="toggle-group"
        className={cn(variant === "switch" ? tabSwitchTrack : "flex", className)}
        {...props}
      />
    </VariantContext.Provider>
  )
}

function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  const variant = useContext(VariantContext)
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        variant === "switch"
          ? tabSwitchOption
          : "cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "focus-visible:z-10",
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
