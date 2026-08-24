"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
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
import { register as registerUser } from "@/features/auth/auth.service";
import { participantPasswordSchema } from "@/features/auth/auth.validation";
import { ApiError } from "@/lib/http/api-error";

function normalizeCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome."),
    cpf: z
      .string()
      .transform((value) => normalizeCpf(value))
      .refine(
        (value) => /^\d{11}$/.test(value),
        "Informe um CPF com 11 dígitos.",
      ),
    email: z.string().email("Informe um e-mail válido."),
    password: participantPasswordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["passwordConfirmation"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      cpf: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    const payload = {
      name: values.name.trim(),
      cpf: values.cpf,
      email: values.email.trim().toLowerCase(),
      password: values.password,
    };

    try {
      await registerUser(payload);
      toast.success("Cadastro criado.");
      router.replace("/home");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Não foi possível criar seu cadastro.";

      toast.error(message);
    }
  }

  return (
    <Card className="w-full border-primary/20">
      <CardHeader>
        <CardTitle>Criar cadastro</CardTitle>
        <CardDescription>
          Nome, CPF, e-mail e senha liberam seu acesso inicial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Maria Silva"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-sm font-medium text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              autoComplete="off"
              inputMode="numeric"
              placeholder="00000000000"
              aria-invalid={Boolean(errors.cpf)}
              {...register("cpf")}
            />
            {errors.cpf ? (
              <p className="text-sm font-medium text-destructive">{errors.cpf.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              autoComplete="email"
              inputMode="email"
              placeholder="voce@email.com"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-sm font-medium text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              autoComplete="new-password"
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="passwordConfirmation">Confirmar senha</Label>
            <Input
              id="passwordConfirmation"
              autoComplete="new-password"
              type="password"
              aria-describedby={
                errors.passwordConfirmation
                  ? "password-confirmation-error"
                  : undefined
              }
              aria-invalid={Boolean(errors.passwordConfirmation)}
              {...register("passwordConfirmation")}
            />
            {errors.passwordConfirmation ? (
              <p
                className="text-sm font-medium text-destructive"
                id="password-confirmation-error"
                role="alert"
              >
                {errors.passwordConfirmation.message}
              </p>
            ) : null}
          </div>

          <Button className="w-full" disabled={isSubmitting} type="submit">
            <UserPlus aria-hidden="true" data-icon="inline-start" />
            {isSubmitting ? "Criando..." : "Criar e entrar"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Ja tem cadastro?{" "}
            <Link className="font-semibold text-primary hover:underline" href="/login">
              Entrar agora
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
