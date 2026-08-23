"use client";

import { useEffect, useRef } from "react";
import { startQrScanner } from "@/features/actions/qr-scanner";

type QrCodeScannerProps = {
  isActive: boolean;
  onDetected: (code: string) => void;
  onError: (error: unknown) => void;
  onStarted?: () => void;
};

export function QrCodeScanner({
  isActive,
  onDetected,
  onError,
  onStarted,
}: QrCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);
  const onStartedRef = useRef(onStarted);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onErrorRef.current = onError;
    onStartedRef.current = onStarted;
  }, [onDetected, onError, onStarted]);

  useEffect(() => {
    if (!isActive || !videoRef.current) {
      return;
    }

    let isCancelled = false;
    let session: { stop: () => void } | undefined;
    const video = videoRef.current;

    void startQrScanner(video, (code) => onDetectedRef.current(code))
      .then((nextSession) => {
        if (isCancelled) {
          nextSession.stop();
          return;
        }

        session = nextSession;
        onStartedRef.current?.();
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          onErrorRef.current(error);
        }
      });

    return () => {
      isCancelled = true;
      session?.stop();
    };
  }, [isActive]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-secondary/30 bg-black/35">
      <video
        ref={videoRef}
        aria-label="Prévia da câmera"
        autoPlay
        className="aspect-video w-full object-cover"
        muted
        playsInline
      />
    </div>
  );
}
