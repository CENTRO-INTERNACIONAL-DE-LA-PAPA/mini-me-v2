import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

// The tab switch, shared with ToggleGroup: a grey well holding the options; the selected one
// (an active tab, a pressed toggle) is an outlined white pill. Vertical lists (Settings) use the
// same style with roomier options.
const tabSwitchTrack = "flex w-fit items-center gap-1 rounded-xl bg-well p-1 text-ink-2"

const tabSwitchOption =
  "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-control font-medium whitespace-nowrap transition-[color,background-color] duration-150 ease-out outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 data-active:border-border data-active:bg-card data-active:text-foreground aria-pressed:border-border aria-pressed:bg-card aria-pressed:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        tabSwitchTrack,
        "data-[orientation=vertical]:w-full data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:p-1.5",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        tabSwitchOption,
        "data-[orientation=vertical]:justify-start data-[orientation=vertical]:px-3 data-[orientation=vertical]:py-2.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabSwitchOption, tabSwitchTrack }
