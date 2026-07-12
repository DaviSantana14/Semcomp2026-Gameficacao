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
    <nav aria-label="Paginacao" className="flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="font-mono text-xs uppercase text-muted-foreground">
        Pagina {page} de {safeTotal}
      </p>
      <div className="flex gap-2">
        <Button aria-label="Pagina anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)} variant="outline">
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Button>
        <Button aria-label="Proxima pagina" disabled={page >= safeTotal} onClick={() => onPageChange(page + 1)} variant="outline">
          Proxima
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
