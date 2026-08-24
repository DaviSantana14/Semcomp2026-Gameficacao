"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchSessionSecurity } from "@/features/auth/auth.service";
import type { SessionSecurityResponse } from "@/features/auth/auth.types";
import { ApiError } from "@/lib/http/api-error";
import { ChangeRequiredPasswordForm } from "./change-required-password-form";

export default function ChangeRequiredPasswordPage() {
  const router = useRouter();
  const [security, setSecurity] = useState<SessionSecurityResponse | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSessionSecurity()
      .then((response) => {
        if (!active) return;
        if (!response.passwordChangeRequired) {
          router.replace("/home");
          return;
        }
        setSecurity(response);
      })
      .catch((caught) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace("/login");
          return;
        }
        setError(
          caught instanceof Error
            ? caught
            : new Error("Não foi possível validar a sessão."),
        );
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (error) {
    return (
      <main className="semcomp-atmosphere flex min-h-dvh items-center justify-center p-4 md:p-6">
        <p className="max-w-lg text-sm text-destructive" role="alert">
          {error.message}
        </p>
      </main>
    );
  }

  if (!security) {
    return (
      <main className="semcomp-atmosphere flex min-h-dvh items-center justify-center p-4 md:p-6">
        <p aria-label="Validando sessão" className="text-sm text-muted-foreground" role="status">
          Validando sua sessão...
        </p>
      </main>
    );
  }

  return (
    <main className="semcomp-atmosphere flex min-h-dvh items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-lg">
        <ChangeRequiredPasswordForm />
      </div>
    </main>
  );
}
