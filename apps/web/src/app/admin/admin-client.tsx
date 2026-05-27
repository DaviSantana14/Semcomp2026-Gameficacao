"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, PackagePlus, Plus, Shield, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import {
  ActionType,
  ApiError,
  cancelRedemption,
  createAction,
  createReward,
  deliverRedemption,
  fetchPendingRedemptions,
  fetchCsrfToken,
  getCsrfToken,
} from "@/lib/api";

const actionTypes: ActionType[] = [
  "CHECKIN",
  "ATTENDANCE",
  "STAND_VISIT",
  "EASTER_EGG",
  "QUESTION",
  "DYNAMIC",
  "BONUS",
];

const createActionSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da atividade pontuavel."),
  description: z
    .string()
    .transform((value) => value.trim())
    .optional(),
  type: z.enum(actionTypes),
  points: z.coerce.number().int().positive("Informe uma pontuacao positiva."),
  code: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => value.length === 0 || /^[A-Z0-9-]+$/.test(value), {
      message: "Use apenas letras, numeros e hifen.",
    })
    .optional(),
  isActive: z.boolean(),
});

type CreateActionInput = z.input<typeof createActionSchema>;
type CreateActionValues = z.output<typeof createActionSchema>;

const createRewardSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da recompensa."),
  description: z
    .string()
    .transform((value) => value.trim())
    .optional(),
  costInPoints: z.coerce.number().int().positive("Informe um custo positivo."),
  stock: z.coerce.number().int().min(0, "Estoque nao pode ser negativo."),
  imageUrl: z
    .string()
    .transform((value) => value.trim())
    .optional(),
  isActive: z.boolean(),
});

type CreateRewardInput = z.input<typeof createRewardSchema>;
type CreateRewardValues = z.output<typeof createRewardSchema>;

export function AdminClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, error, isLoading } = useMe();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateActionInput, unknown, CreateActionValues>({
    resolver: zodResolver(createActionSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "CHECKIN",
      points: 10,
      code: "",
      isActive: true,
    },
  });
  const {
    formState: { errors: rewardErrors, isSubmitting: isRewardSubmitting },
    handleSubmit: handleRewardSubmit,
    register: registerReward,
    reset: resetReward,
  } = useForm<CreateRewardInput, unknown, CreateRewardValues>({
    resolver: zodResolver(createRewardSchema),
    defaultValues: {
      name: "",
      description: "",
      costInPoints: 50,
      stock: 10,
      imageUrl: "",
      isActive: true,
    },
  });
  const {
    data: pendingRedemptions,
    error: pendingRedemptionsError,
    isLoading: isPendingLoading,
    refetch: refetchPendingRedemptions,
  } = useQuery({
    enabled: user?.role === "ADMIN",
    queryKey: ["admin", "redemptions", "pending"],
    queryFn: fetchPendingRedemptions,
    retry: false,
  });
  const deliverMutation = useMutation({
    mutationFn: deliverRedemption,
    onSuccess: () => {
      toast.success("Resgate marcado como entregue.");
      void queryClient.invalidateQueries({
        queryKey: ["admin", "redemptions", "pending"],
      });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel marcar o resgate como entregue.";
      toast.error(message);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelRedemption,
    onSuccess: () => {
      toast.success("Resgate cancelado e saldo devolvido.");
      void queryClient.invalidateQueries({
        queryKey: ["admin", "redemptions", "pending"],
      });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel cancelar o resgate.";
      toast.error(message);
    },
  });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  useEffect(() => {
    if (user && user.role !== "ADMIN") {
      router.replace("/home");
    }
  }, [router, user]);

  async function onSubmit(values: CreateActionValues) {
    try {
      if (!getCsrfToken()) {
        await fetchCsrfToken();
      }

      const action = await createAction({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        type: values.type,
        points: values.points,
        code: values.code?.trim() || undefined,
        isActive: values.isActive,
      });

      toast.success(`Atividade ${action.name} criada.`);
      reset({
        name: "",
        description: "",
        type: "CHECKIN",
        points: 10,
        code: "",
        isActive: true,
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel criar a atividade pontuavel.";
      toast.error(message);
    }
  }

  async function onSubmitReward(values: CreateRewardValues) {
    try {
      if (!getCsrfToken()) {
        await fetchCsrfToken();
      }

      const reward = await createReward({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        costInPoints: values.costInPoints,
        stock: values.stock,
        imageUrl: values.imageUrl?.trim() || undefined,
        isActive: values.isActive,
      });

      toast.success(`Recompensa ${reward.name} criada.`);
      resetReward({
        name: "",
        description: "",
        costInPoints: 50,
        stock: 10,
        imageUrl: "",
        isActive: true,
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel criar a recompensa.";
      toast.error(message);
    }
  }

  async function handleDeliver(redemptionId: string) {
    if (!getCsrfToken()) {
      await fetchCsrfToken();
    }

    deliverMutation.mutate(redemptionId);
  }

  async function handleCancel(redemptionId: string) {
    if (!getCsrfToken()) {
      await fetchCsrfToken();
    }

    cancelMutation.mutate(redemptionId);
  }

  if (isLoading || !user || user.role !== "ADMIN") {
    return (
      <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
        <div className="mx-auto h-48 w-full max-w-4xl rounded-lg border border-border bg-card" />
      </main>
    );
  }

  return (
    <main className="arcade-grid min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button
            className="w-full sm:w-fit"
            onClick={() => router.push("/home")}
            variant="outline"
          >
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Voltar
          </Button>
          <LogoutButton className="w-full sm:w-fit" />
        </div>

        <header className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-card/85 p-5 md:p-6">
          <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">
            <Shield aria-hidden="true" data-icon="inline-start" />
            Admin
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-black tracking-normal md:text-5xl">
              Operacao do evento
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Cadastre atividades, recompensas e acompanhe entregas pendentes da
              lojinha.
            </p>
          </div>
        </header>

        <Card className="border-primary/20 bg-card/90">
          <CardHeader>
            <CardTitle>Nova atividade pontuavel</CardTitle>
            <CardDescription>O codigo e opcional, mas deve ser unico.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" placeholder="Check-in Dia 1" {...register("name")} />
                  {errors.name ? (
                    <p className="text-sm font-medium text-destructive">
                      {errors.name.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="code">Codigo</Label>
                  <Input id="code" placeholder="DIA1" {...register("code")} />
                  {errors.code ? (
                    <p className="text-sm font-medium text-destructive">
                      {errors.code.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Descricao</Label>
                <Input
                  id="description"
                  placeholder="Presenca registrada no primeiro dia"
                  {...register("description")}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    className="min-h-11 rounded-md border border-input bg-muted/70 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    {...register("type")}
                  >
                    {actionTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="points">Points / XP</Label>
                  <Input
                    id="points"
                    inputMode="numeric"
                    min={1}
                    type="number"
                    {...register("points")}
                  />
                  {errors.points ? (
                    <p className="text-sm font-medium text-destructive">
                      {errors.points.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-muted/50 px-3 text-sm font-medium">
                <input
                  className="size-4 accent-primary"
                  type="checkbox"
                  {...register("isActive")}
                />
                Atividade ativa
              </label>

              <Button className="w-full md:w-fit" disabled={isSubmitting} type="submit">
                <Plus aria-hidden="true" data-icon="inline-start" />
                {isSubmitting ? "Criando..." : "Criar atividade"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-accent/20 bg-card/90">
          <CardHeader>
            <CardTitle>Nova recompensa</CardTitle>
            <CardDescription>
              Points sao debitados no resgate; XP nunca muda na lojinha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-5"
              onSubmit={handleRewardSubmit(onSubmitReward)}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reward-name">Nome</Label>
                  <Input
                    id="reward-name"
                    placeholder="Camiseta Semcomp"
                    {...registerReward("name")}
                  />
                  {rewardErrors.name ? (
                    <p className="text-sm font-medium text-destructive">
                      {rewardErrors.name.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="imageUrl">Imagem URL</Label>
                  <Input
                    id="imageUrl"
                    placeholder="https://..."
                    {...registerReward("imageUrl")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="reward-description">Descricao</Label>
                <Input
                  id="reward-description"
                  placeholder="Item disponivel na lojinha"
                  {...registerReward("description")}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="costInPoints">Custo em PTS</Label>
                  <Input
                    id="costInPoints"
                    inputMode="numeric"
                    min={1}
                    type="number"
                    {...registerReward("costInPoints")}
                  />
                  {rewardErrors.costInPoints ? (
                    <p className="text-sm font-medium text-destructive">
                      {rewardErrors.costInPoints.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="stock">Estoque</Label>
                  <Input
                    id="stock"
                    inputMode="numeric"
                    min={0}
                    type="number"
                    {...registerReward("stock")}
                  />
                  {rewardErrors.stock ? (
                    <p className="text-sm font-medium text-destructive">
                      {rewardErrors.stock.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-muted/50 px-3 text-sm font-medium">
                <input
                  className="size-4 accent-primary"
                  type="checkbox"
                  {...registerReward("isActive")}
                />
                Recompensa ativa
              </label>

              <Button
                className="w-full md:w-fit"
                disabled={isRewardSubmitting}
                type="submit"
              >
                <PackagePlus aria-hidden="true" data-icon="inline-start" />
                {isRewardSubmitting ? "Criando..." : "Criar recompensa"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-success/20 bg-card/90">
          <CardHeader>
            <CardTitle>Entregas pendentes</CardTitle>
            <CardDescription>
              Marque como entregue quando o participante retirar o item fisico.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {isPendingLoading ? (
              <div className="rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
                Carregando entregas pendentes...
              </div>
            ) : pendingRedemptionsError ? (
              <div className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                <div>
                  <p className="font-bold text-destructive">
                    Nao foi possivel carregar as entregas pendentes.
                  </p>
                  <p className="text-muted-foreground">
                    {pendingRedemptionsError instanceof ApiError
                      ? pendingRedemptionsError.message
                      : "Tente novamente em instantes."}
                  </p>
                </div>
                <Button
                  className="w-full md:w-fit"
                  onClick={() => void refetchPendingRedemptions()}
                  variant="outline"
                >
                  Tentar novamente
                </Button>
              </div>
            ) : pendingRedemptions && pendingRedemptions.length > 0 ? (
              pendingRedemptions.map((redemption) => (
                <div
                  className="grid gap-3 rounded-lg border border-border bg-muted/45 p-4 md:grid-cols-[1fr_auto]"
                  key={redemption.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground md:text-base">
                      {redemption.reward.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {redemption.user.name} - {redemption.pointsSpent} PTS
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {redemption.user.email}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:flex">
                    <Button
                      className="h-9"
                      disabled={deliverMutation.isPending || cancelMutation.isPending}
                      onClick={() => void handleDeliver(redemption.id)}
                    >
                      <Check aria-hidden="true" data-icon="inline-start" />
                      Entregue
                    </Button>
                    <Button
                      className="h-9"
                      disabled={deliverMutation.isPending || cancelMutation.isPending}
                      onClick={() => void handleCancel(redemption.id)}
                      variant="outline"
                    >
                      <X aria-hidden="true" data-icon="inline-start" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
                Nenhuma entrega pendente.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
