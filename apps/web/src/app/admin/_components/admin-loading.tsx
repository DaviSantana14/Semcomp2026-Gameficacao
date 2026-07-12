import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando painel administrativo" className="flex flex-col gap-5">
      <Card className="border-primary/20 bg-card/90">
        <CardHeader><div className="h-7 w-48 rounded-md bg-muted" /></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="h-20 rounded-md bg-muted" />
          <div className="h-20 rounded-md bg-muted" />
          <div className="h-20 rounded-md bg-muted" />
        </CardContent>
      </Card>
      <div className="h-64 rounded-lg border border-border bg-card/90" />
    </div>
  );
}
