import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cn } from "@/lib/utils"
import { tabSwitchOption } from "@/components/ui/tabs"

function Toggle({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(tabSwitchOption, className)}
      {...props}
    />
  )
}

export { Toggle }
