import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando painel administrativo" className="flex flex-col gap-5">
      <Card className="border-primary/20 bg-card/90">
        <CardHeader><Skeleton className="h-7 w-48" /></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
      <Skeleton className="h-64 border border-border bg-card/90" />
    </div>
  );
}
