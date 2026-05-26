"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { useMe } from "@/hooks/use-auth";
import {
  ActionType,
  ApiError,
  createAction,
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
  name: z.string().trim().min(2, "Informe o nome da action."),
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

export function AdminClient() {
  const router = useRouter();
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

      toast.success(`Action ${action.name} criada.`);
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
          : "Nao foi possivel criar a action.";
      toast.error(message);
    }
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
        <header className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-card/85 p-5 md:p-6">
          <Badge className="w-fit border-primary/40 bg-primary/10 text-primary">
            <Shield aria-hidden="true" data-icon="inline-start" />
            Admin
          </Badge>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-black tracking-normal md:text-5xl">
              Criar action
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Cadastre uma action pontuavel com codigo reutilizavel para check-in,
              stand, presenca ou dinamica do evento.
            </p>
          </div>
        </header>

        <Card className="border-primary/20 bg-card/90">
          <CardHeader>
            <CardTitle>Nova action</CardTitle>
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
                Action ativa
              </label>

              <Button className="w-full md:w-fit" disabled={isSubmitting} type="submit">
                <Plus aria-hidden="true" data-icon="inline-start" />
                {isSubmitting ? "Criando..." : "Criar action"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
