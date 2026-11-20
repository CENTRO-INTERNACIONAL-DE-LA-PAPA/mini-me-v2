import { cn } from "@/lib/utils"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex w-full min-w-0 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-balance",
        className
      )}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-ui text-muted-foreground [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

export { Empty, EmptyDescription }
