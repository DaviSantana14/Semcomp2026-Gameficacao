import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
