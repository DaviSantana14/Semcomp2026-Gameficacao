"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
  TicketCheck,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  fetchActions,
  fetchCsrfToken,
  generateClaimCodes,
  GeneratedClaimCodesResponse,
  getCsrfToken,
} from "@/lib/api";

const claimCodeSchema = z.object({
  actionId: z.string().min(1, "Selecione uma atividade."),
  quantity: z.coerce
    .number()
    .int("Informe uma quantidade inteira.")
    .min(1, "Gere pelo menos 1 codigo.")
    .max(500, "Gere no maximo 500 codigos por lote."),
});

type ClaimCodeInput = z.input<typeof claimCodeSchema>;
type ClaimCodeValues = z.output<typeof claimCodeSchema>;

export function ClaimCodeGenerator() {
  const [lastBatch, setLastBatch] =
    useState<GeneratedClaimCodesResponse | null>(null);
  const {
    data: actions,
    error: actionsError,
    isPending: isActionsPending,
    refetch: refetchActions,
  } = useQuery({
    queryKey: ["admin", "actions"],
    queryFn: fetchActions,
    retry: false,
  });
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ClaimCodeInput, unknown, ClaimCodeValues>({
    resolver: zodResolver(claimCodeSchema),
    defaultValues: { actionId: "", quantity: 50 },
  });
  const generateMutation = useMutation({
    mutationFn: async (values: ClaimCodeValues) => {
      if (!getCsrfToken()) {
        await fetchCsrfToken();
      }

      return generateClaimCodes(values.actionId, { quantity: values.quantity });
    },
    onSuccess: (batch) => {
      setLastBatch(batch);
      toast.success(`${batch.quantity} codigos gerados para ${batch.action.name}.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel gerar o lote de codigos.",
      );
    },
  });

  const codesText = lastBatch?.codes.join("\n") ?? "";

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codesText);
      toast.success("Codigos copiados.");
    } catch {
      toast.error("Nao foi possivel copiar. Selecione os codigos manualmente.");
    }
  }

  function downloadCodes() {
    if (!lastBatch) return;

    const blob = new Blob([`${codesText}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeActionName = lastBatch.action.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    link.href = url;
    link.download = `codigos-${safeActionName || lastBatch.action.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="overflow-hidden border-primary/25 bg-card/90">
      <CardHeader className="border-b border-primary/15 bg-primary/5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <TicketCheck aria-hidden="true" className="size-5" />
          </div>
          <div className="grid gap-1">
            <CardTitle>Gerar codigos de uso unico</CardTitle>
            <CardDescription>
              Crie um lote para distribuir em uma atividade pontuavel.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-6">
        {isActionsPending ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Carregando atividades...
          </div>
        ) : actionsError ? (
          <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <div>
              <p className="font-bold text-destructive">
                Nao foi possivel carregar as atividades.
              </p>
              <p className="text-muted-foreground">
                {actionsError instanceof ApiError
                  ? actionsError.message
                  : "Tente novamente em instantes."}
              </p>
            </div>
            <Button
              className="w-full md:w-fit"
              onClick={() => void refetchActions()}
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              Tentar novamente
            </Button>
          </div>
        ) : actions?.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
            Crie uma atividade antes de gerar codigos de uso unico.
          </div>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={handleSubmit((values) => generateMutation.mutate(values))}
          >
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="flex flex-col gap-2">
                <Label htmlFor="claim-code-action">Atividade</Label>
                <select
                  id="claim-code-action"
                  className="min-h-11 rounded-md border border-input bg-muted/70 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  {...register("actionId")}
                >
                  <option value="">Selecione uma atividade</option>
                  {actions?.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.name} - {action.points} PTS
                    </option>
                  ))}
                </select>
                {errors.actionId ? (
                  <p className="text-sm font-medium text-destructive">
                    {errors.actionId.message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="claim-code-quantity">Quantidade</Label>
                <Input
                  id="claim-code-quantity"
                  inputMode="numeric"
                  max={500}
                  min={1}
                  type="number"
                  {...register("quantity")}
                />
                {errors.quantity ? (
                  <p className="text-sm font-medium text-destructive">
                    {errors.quantity.message}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              className="w-full md:w-fit"
              disabled={generateMutation.isPending}
              type="submit"
            >
              {generateMutation.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <TicketCheck aria-hidden="true" data-icon="inline-start" />
              )}
              {generateMutation.isPending ? "Gerando lote..." : "Gerar lote"}
            </Button>
          </form>
        )}

        {lastBatch ? (
          <section className="grid gap-4 rounded-lg border border-primary/25 bg-muted/35 p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  Ultimo lote gerado
                </p>
                <h3 className="mt-1 text-lg font-black">{lastBatch.action.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {lastBatch.quantity} codigos de uso unico
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void copyCodes()} type="button" variant="outline">
                  <Copy aria-hidden="true" data-icon="inline-start" />
                  Copiar todos
                </Button>
                <Button onClick={downloadCodes} type="button" variant="outline">
                  <Download aria-hidden="true" data-icon="inline-start" />
                  Baixar .txt
                </Button>
              </div>
            </div>
            <pre className="max-h-72 select-all overflow-auto rounded-md border border-border bg-background/80 p-4 font-mono text-sm leading-6 text-foreground">
              {codesText}
            </pre>
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-5 text-foreground">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-amber-500"
              />
              <p>
                Copie ou baixe este lote antes de sair da pagina. Ainda nao ha
                historico nem opcao de recuperar estes codigos depois.
              </p>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
