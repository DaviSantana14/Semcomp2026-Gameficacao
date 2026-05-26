"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanLine, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  fetchCsrfToken,
  getCsrfToken,
  redeemActionCode,
} from "@/lib/api";

const redeemCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => /^[A-Z0-9-]+$/.test(value), {
      message: "Use apenas letras, numeros e hifen.",
    }),
});

type RedeemCodeValues = z.infer<typeof redeemCodeSchema>;

type RedeemCodeDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function RedeemCodeDialog({ isOpen, onClose }: RedeemCodeDialogProps) {
  const queryClient = useQueryClient();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setFocus,
  } = useForm<RedeemCodeValues>({
    resolver: zodResolver(redeemCodeSchema),
    defaultValues: {
      code: "",
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ code }: RedeemCodeValues) => {
      if (!getCsrfToken()) {
        await fetchCsrfToken();
      }

      return redeemActionCode(code);
    },
    onSuccess: async (result) => {
      toast.success(`${result.action.name}: +${result.awardedPoints} XP`);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      reset();
      onClose();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Nao foi possivel resgatar este codigo.";
      toast.error(message);
    },
  });

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setFocus("code"), 0);
    }
  }, [isOpen, setFocus]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="redeem-code-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur"
      role="dialog"
    >
      <div className="scanline w-full max-w-md rounded-lg border border-primary/30 bg-card p-5 shadow-[0_0_80px_color-mix(in_srgb,var(--primary)_18%,transparent)]">
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-xs font-semibold uppercase text-primary">
                resgate
              </p>
              <h2 id="redeem-code-title" className="text-2xl font-black">
                Digite o codigo
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Use o codigo informado no evento para receber points e XP.
              </p>
            </div>
            <Button
              aria-label="Fechar"
              className="size-11 shrink-0 px-0"
              onClick={onClose}
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((values) => redeemMutation.mutate(values))}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="redeem-code">Codigo</Label>
              <Input
                id="redeem-code"
                autoComplete="off"
                placeholder="DIA1"
                aria-invalid={Boolean(errors.code)}
                {...register("code")}
              />
              {errors.code ? (
                <p className="text-sm font-medium text-destructive">
                  {errors.code.message}
                </p>
              ) : null}
            </div>

            <Button
              className="w-full"
              disabled={redeemMutation.isPending}
              type="submit"
            >
              <ScanLine aria-hidden="true" data-icon="inline-start" />
              {redeemMutation.isPending ? "Resgatando..." : "Resgatar codigo"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
