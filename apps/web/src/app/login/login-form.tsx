"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { login } from "@/features/auth/auth.service";
import { ApiError } from "@/lib/http/api-error";

const loginSchema = z.object({
  cpf: z
    .string()
    .transform((value) => normalizeCpf(value))
    .refine(
      (value) => /^\d{11}$/.test(value),
      "Informe um CPF com 11 dígitos.",
    ),
  email: z.string().email("Informe um e-mail válido."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

export function LoginForm() {
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      cpf: "",
      email: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      const response = await login({
        cpf: values.cpf,
        email: values.email.trim().toLowerCase(),
      });

      toast.success("Login realizado.");
      router.replace(response.user.role === "ADMIN" ? "/admin" : "/home");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel entrar. Tente novamente.";
      toast.error(message);
    }
  }

  return (
    <Card className="relative z-10 w-full border-secondary/25 bg-card/85 shadow-[0_2rem_6rem_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>
          Use o CPF e o e-mail cadastrados no evento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              autoComplete="username"
              inputMode="numeric"
              placeholder="00000000000"
              aria-describedby={errors.cpf ? "cpf-error" : undefined}
              aria-invalid={Boolean(errors.cpf)}
              {...register("cpf")}
            />
            {errors.cpf ? (
              <p
                className="text-sm font-medium text-destructive"
                id="cpf-error"
                role="alert"
              >
                {errors.cpf.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              autoComplete="email"
              inputMode="email"
              placeholder="voce@email.com"
              aria-describedby={errors.email ? "email-error" : undefined}
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email ? (
              <p
                className="text-sm font-medium text-destructive"
                id="email-error"
                role="alert"
              >
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <Button className="w-full" disabled={isSubmitting} type="submit">
            <LogIn aria-hidden="true" data-icon="inline-start" />
            {isSubmitting ? "Entrando..." : "Entrar na jornada"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Ainda não se cadastrou?{" "}
            <Link
              className="font-semibold text-primary hover:underline"
              href="/cadastro"
            >
              Criar cadastro
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
