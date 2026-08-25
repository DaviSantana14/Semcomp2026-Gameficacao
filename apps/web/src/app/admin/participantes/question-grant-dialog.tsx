"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  fetchAdminActions,
  grantQuestionAction,
} from "@/features/actions/actions.service";
import type { AdminQuestionGrantResponse } from "@/features/actions/actions.types";
import { ApiError } from "@/lib/http/api-error";
import { adminSelectClassName } from "../_components/admin-page";

type QuestionGrantDialogProps = {
  participant: { id: string; name: string };
  onClose: () => void;
  onSuccess: (result: AdminQuestionGrantResponse) => void;
};

export function QuestionGrantDialog({
  participant,
  onClose,
  onSuccess,
}: QuestionGrantDialogProps) {
  const [selectedId, setSelectedId] = useState("");
  const actionsQuery = useQuery({
    queryKey: ["admin", "question-actions", "active"],
    queryFn: () =>
      fetchAdminActions({
        page: 1,
        limit: 100,
        status: "active",
        type: "QUESTION",
      }),
    retry: false,
  });
  const actions = actionsQuery.data?.items ?? [];
  const effectiveActionId =
    selectedId || (actions.length === 1 ? actions[0]?.id : "") || "";
  const selectedAction = actions.find(
    (action) => action.id === effectiveActionId,
  );
  const grantMutation = useMutation({
    mutationFn: () => grantQuestionAction(effectiveActionId, participant.id),
    onSuccess: (result) => {
      toast.success("Pontos de pergunta registrados.");
      onSuccess(result);
      onClose();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível registrar os pontos.",
      ),
  });

  return (
    <Dialog
      onClose={onClose}
      open
      preventClose={grantMutation.isPending}
      titleId="question-grant-title"
    >
      <div className="grid gap-5">
        <div>
          <p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">
            pergunta em palestra
          </p>
          <h2 className="mt-2 text-2xl font-bold" id="question-grant-title">
            Registrar pergunta
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Participante: <strong>{participant.name}</strong>
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="question-action">Palestra</Label>
          <select
            className={adminSelectClassName}
            disabled={actionsQuery.isLoading || actions.length === 0}
            id="question-action"
            onChange={(event) => setSelectedId(event.target.value)}
            value={effectiveActionId}
          >
            {actions.length !== 1 ? (
              <option value="">Selecione uma palestra</option>
            ) : null}
            {actions.map((action) => (
              <option key={action.id} value={action.id}>
                {action.name}
              </option>
            ))}
          </select>
        </div>

        {actionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Carregando palestras...
          </p>
        ) : actionsQuery.error ? (
          <p className="text-sm text-destructive" role="alert">
            Não foi possível carregar as palestras ativas.
          </p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-destructive" role="alert">
            Nenhuma palestra de pergunta está ativa. Crie ou ative uma atividade
            do tipo Pergunta antes de continuar.
          </p>
        ) : selectedAction ? (
          <div className="rounded-[12px] border border-primary/30 bg-primary/10 p-4">
            <p className="text-sm font-semibold">{selectedAction.name}</p>
            <p className="mt-1 font-mono text-sm font-bold text-primary">
              +{selectedAction.points} pontos / +{selectedAction.points} XP
            </p>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={grantMutation.isPending}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={!selectedAction || grantMutation.isPending}
            onClick={() => grantMutation.mutate()}
            type="button"
          >
            {grantMutation.isPending ? "Registrando..." : "Confirmar pontos"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
