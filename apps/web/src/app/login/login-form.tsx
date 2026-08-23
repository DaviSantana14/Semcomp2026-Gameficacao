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
import { participantPasswordSchema } from "@/features/auth/auth.validation";
import { ApiError } from "@/lib/http/api-error";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: participantPasswordSchema,
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      const response = await login({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      toast.success("Login realizado.");
      router.replace(
        response.user.passwordChangeRequired
          ? "/trocar-senha"
          : response.user.role === "ADMIN"
            ? "/admin"
            : "/home",
      );
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
          Use o e-mail e a senha cadastrados no evento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              autoComplete="username"
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              autoComplete="current-password"
              type="password"
              aria-describedby={errors.password ? "password-error" : undefined}
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {errors.password ? (
              <p
                className="text-sm font-medium text-destructive"
                id="password-error"
                role="alert"
              >
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button className="w-full" disabled={isSubmitting} type="submit">
            <LogIn aria-hidden="true" data-icon="inline-start" />
            {isSubmitting ? "Entrando..." : "Entrar na jornada"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            A recuperação automática de senha não está disponível.
          </p>

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
