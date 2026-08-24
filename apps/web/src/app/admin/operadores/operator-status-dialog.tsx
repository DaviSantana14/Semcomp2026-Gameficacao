"use client";

import type { AdminOperator } from "@/features/operators/operators.types";
import { AdminReasonDialog } from "../_components/admin-reason-dialog";

export function OperatorStatusDialog({
  onClose,
  onSubmit,
  operator,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  operator: AdminOperator;
}) {
  const activating = !operator.isActive;
  return (
    <AdminReasonDialog
      confirmLabel="Confirmar alteração"
      currentState={operator.isActive ? "Ativo" : "Inativo"}
      description={`${operator.name} · ${operator.email}`}
      intendedState={activating ? "Ativo" : "Inativo"}
      onClose={onClose}
      onSubmit={onSubmit}
      operationKey={`${operator.id}:${String(activating)}`}
      title={activating ? "Reativar operador" : "Inativar operador"}
    />
  );
}
