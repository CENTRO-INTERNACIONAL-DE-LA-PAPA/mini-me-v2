import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/** The white card every Interactive Component sits in. With a `title`, `actions` or a `footer`,
 * those sit in bands divided by hairlines and the body runs to the card's edges; otherwise the
 * card pads its content. */
export function ComponentCard({
  title,
  actions,
  footer,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Card>, "title"> & {
  title?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const banded = title !== undefined || actions !== undefined || footer !== undefined;
  return (
    <Card
      variant="outline"
      size="sm"
      className={cn("w-full min-w-0", banded && "gap-0 p-0", className)}
      {...props}
    >
      {(title !== undefined || actions !== undefined) && (
        <CardHeader className="flex-wrap gap-y-2 border-b border-border px-4 py-2.5">
          <CardTitle className="mr-auto">{title}</CardTitle>
          {actions}
        </CardHeader>
      )}
      {children}
      {footer && <CardFooter className="border-t border-border px-4 py-2">{footer}</CardFooter>}
    </Card>
  );
}
