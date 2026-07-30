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
import { adminLogin } from "@/features/auth/auth.service";
import { ApiError } from "@/lib/http/api-error";

const adminLoginSchema = z.object({
  cpf: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine(
      (value) => /^\d{11}$/.test(value),
      "Informe um CPF com 11 dígitos.",
    ),
  email: z.string().email("Informe um e-mail válido."),
  password: z
    .string()
    .refine(
      (value) =>
        Array.from(value).length >= 12 && Array.from(value).length <= 64,
      "A senha deve ter entre 12 e 64 caracteres.",
    )
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      "A senha deve ter no máximo 72 bytes em UTF-8.",
    ),
});

type AdminLoginFormValues = z.infer<typeof adminLoginSchema>;

export function AdminLoginForm() {
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<AdminLoginFormValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { cpf: "", email: "", password: "" },
  });

  async function onSubmit(values: AdminLoginFormValues) {
    try {
      await adminLogin({
        cpf: values.cpf,
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      toast.success("Login administrativo realizado.");
      router.replace("/admin");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível entrar. Tente novamente.",
      );
    }
  }

  return (
    <Card className="relative z-10 w-full border-secondary/25 bg-card/85 shadow-[0_2rem_6rem_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Acesso administrativo</CardTitle>
        <CardDescription>Use suas credenciais administrativas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              autoComplete="username"
              inputMode="numeric"
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
              type="password"
              autoComplete="current-password"
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
            {isSubmitting ? "Entrando..." : "Entrar como administrador"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            É participante?{" "}
            <Link
              className="font-semibold text-primary hover:underline"
              href="/login"
            >
              Acessar a jornada
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
