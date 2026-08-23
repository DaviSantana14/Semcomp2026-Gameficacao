"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, RotateCcw, ScanLine, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemActionCode } from "@/features/actions/actions.service";
import { InsecureCameraContextError } from "@/features/actions/qr-scanner";
import {
  redeemCodeSchema,
  type RedeemCodeValues,
} from "@/features/actions/redeem-code.validation";
import { ApiError } from "@/lib/http/api-error";
import { QrCodeScanner } from "./qr-code-scanner";

type CameraState =
  | "manual"
  | "requesting"
  | "scanning"
  | "detected"
  | "camera-error";

type RedeemCodeDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function RedeemCodeDialog({ isOpen, onClose }: RedeemCodeDialogProps) {
  const queryClient = useQueryClient();
  const [cameraState, setCameraState] = useState<CameraState>("manual");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const {
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setFocus,
    setValue,
  } = useForm<RedeemCodeValues>({
    resolver: zodResolver(redeemCodeSchema),
    defaultValues: {
      code: "",
    },
  });
  const codeField = register("code");

  const redeemMutation = useMutation({
    mutationFn: ({ code }: RedeemCodeValues) => redeemActionCode(code),
    onSuccess: async (result) => {
      toast.success(`${result.action.name}: +${result.awardedXp} XP`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["ranking"] }),
      ]);
      setCameraState("manual");
      setCameraError(null);
      setDetectedCode(null);
      reset();
      onClose();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError && [400, 404, 409].includes(error.status)
          ? error.message
          : "Não foi possível resgatar este código.";
      toast.error(message);
    },
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusTimeout = window.setTimeout(() => setFocus("code"), 0);
    return () => window.clearTimeout(focusTimeout);
  }, [isOpen, reset, setFocus]);

  function handleClose() {
    setCameraState("manual");
    setCameraError(null);
    setDetectedCode(null);
    reset();
    onClose();
  }

  function handleCameraError(error: unknown) {
    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

    if (error instanceof InsecureCameraContextError) {
      setCameraError("A câmera exige uma conexão HTTPS fora do localhost.");
    } else if (
      errorName === "NotAllowedError" ||
      errorName === "SecurityError"
    ) {
      setCameraError("Permita o acesso à câmera para escanear o código.");
    } else if (errorName === "NotFoundError") {
      setCameraError(
        "Não encontramos uma câmera disponível neste dispositivo.",
      );
    } else {
      setCameraError(
        "Não foi possível iniciar a câmera. Tente novamente ou use a digitação manual.",
      );
    }
    setCameraState("camera-error");
  }

  function handleCameraDetected(code: string) {
    setValue("code", code, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    clearErrors("code");
    setDetectedCode(code);
    setCameraState("detected");
  }

  function startCamera() {
    setCameraError(null);
    setDetectedCode(null);
    setCameraState("requesting");
  }

  function stopCamera() {
    setCameraState("manual");
    setCameraError(null);
  }

  function scanAgain() {
    setValue("code", "", { shouldDirty: true, shouldValidate: false });
    clearErrors("code");
    startCamera();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="redeem-code-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-background/80 px-4 backdrop-blur"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-[18px] border border-secondary/35 bg-card p-5 shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-xs font-semibold uppercase text-primary">
                checkpoint // resgate
              </p>
              <h2 id="redeem-code-title" className="text-2xl font-bold">
                Digite o código
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Use um código de atividade ou seu código individual para receber
                pontos e XP.
              </p>
            </div>
            <Button
              aria-label="Fechar"
              className="size-11 shrink-0 px-0"
              onClick={handleClose}
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
              <Label htmlFor="redeem-code">Código</Label>
              <Input
                id="redeem-code"
                autoComplete="off"
                placeholder="ABCD-EFGH"
                spellCheck={false}
                translate="no"
                aria-describedby={
                  errors.code
                    ? "redeem-code-help redeem-code-error"
                    : "redeem-code-help"
                }
                aria-invalid={Boolean(errors.code)}
                {...codeField}
                onChange={(event) => {
                  void codeField.onChange(event);
                  if (cameraState === "detected") {
                    setCameraState("manual");
                    setDetectedCode(null);
                  }
                }}
              />
              <p
                className="text-sm text-muted-foreground"
                id="redeem-code-help"
              >
                Aceita letras, números e hífen.
              </p>
              {errors.code ? (
                <p
                  className="text-sm font-medium text-destructive"
                  id="redeem-code-error"
                  role="alert"
                >
                  {errors.code.message}
                </p>
              ) : null}
            </div>

            {cameraState === "requesting" || cameraState === "scanning" ? (
              <div className="flex flex-col gap-3">
                <QrCodeScanner
                  isActive
                  onDetected={handleCameraDetected}
                  onError={handleCameraError}
                  onStarted={() =>
                    setCameraState((current) =>
                      current === "requesting" ? "scanning" : current,
                    )
                  }
                />
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {cameraState === "requesting"
                    ? "Solicitando acesso à câmera…"
                    : "Aponte a câmera para o código da atividade."}
                </p>
                <Button
                  className="w-full"
                  onClick={stopCamera}
                  type="button"
                  variant="outline"
                >
                  Parar câmera
                </Button>
              </div>
            ) : null}

            {cameraState === "detected" && detectedCode ? (
              <div
                aria-live="polite"
                className="flex flex-col gap-3 rounded-[14px] border border-primary/30 bg-primary/5 p-4"
                role="status"
              >
                <p className="text-sm text-muted-foreground">
                  Código detectado
                </p>
                <p
                  className="font-mono text-lg font-bold tracking-wide"
                  translate="no"
                >
                  {detectedCode}
                </p>
                <Button
                  className="w-full"
                  onClick={scanAgain}
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" data-icon="inline-start" />
                  Escanear novamente
                </Button>
              </div>
            ) : null}

            {cameraState === "camera-error" ? (
              <div className="flex flex-col gap-3" role="alert">
                <p className="text-sm text-destructive">{cameraError}</p>
                <Button
                  className="w-full"
                  onClick={startCamera}
                  type="button"
                  variant="outline"
                >
                  <Camera aria-hidden="true" data-icon="inline-start" />
                  Tentar câmera novamente
                </Button>
              </div>
            ) : null}

            {cameraState === "manual" ? (
              <Button
                className="w-full"
                onClick={startCamera}
                type="button"
                variant="outline"
              >
                <Camera aria-hidden="true" data-icon="inline-start" />
                Usar câmera
              </Button>
            ) : null}

            <Button
              className="w-full"
              disabled={redeemMutation.isPending}
              type="submit"
            >
              <ScanLine aria-hidden="true" data-icon="inline-start" />
              {redeemMutation.isPending
                ? "Resgatando…"
                : cameraState === "detected"
                  ? "Confirmar resgate"
                  : "Resgatar código"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
