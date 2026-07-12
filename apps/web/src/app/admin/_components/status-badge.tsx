import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  label: string;
  status: "active" | "inactive" | "pending";
};

export function StatusBadge({ label, status }: StatusBadgeProps) {
  return (
    <Badge
      className={cn(
        status === "active" && "border-success/40 bg-success/10 text-success",
        status === "inactive" && "border-destructive/40 bg-destructive/10 text-destructive",
        status === "pending" && "border-accent/40 bg-accent/10 text-accent",
      )}
    >
      {label}
    </Badge>
  );
}
