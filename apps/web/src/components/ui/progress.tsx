import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
};

export function Progress({ className, value, ...props }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
