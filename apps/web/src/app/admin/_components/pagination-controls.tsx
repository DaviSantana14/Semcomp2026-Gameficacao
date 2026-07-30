import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function PaginationControls({ page, totalPages, onPageChange }: PaginationControlsProps) {
  const safeTotal = Math.max(1, totalPages);

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-4">
      <p aria-live="polite" className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Página {page} de {safeTotal}
      </p>
      <div className="flex gap-2">
        <Button aria-label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)} variant="outline">
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Button>
        <Button aria-label="Próxima página" disabled={page >= safeTotal} onClick={() => onPageChange(page + 1)} variant="outline">
          Próxima
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
