import type { IScannerControls } from "@zxing/browser";
import { isRedeemCode, normalizeRedeemCode } from "./redeem-code.validation";

export type QrScannerSession = {
  stop: () => void;
};

export class InsecureCameraContextError extends Error {
  constructor() {
    super("A câmera só pode ser usada em uma conexão HTTPS.");
    this.name = "InsecureCameraContextError";
  }
}

function isLocalhost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

function assertCameraContext() {
  if (typeof window === "undefined") {
    return;
  }

  if (!window.isSecureContext && !isLocalhost(window.location.hostname)) {
    throw new InsecureCameraContextError();
  }
}

function isNotFoundScanError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "NotFoundException"
  );
}

function createStopper(video: HTMLVideoElement) {
  let stopped = false;
  const stoppedControls = new Set<IScannerControls>();

  const stopTracks = () => {
    const stream = video.srcObject;
    if (stream && "getTracks" in stream) {
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    video.pause();
  };

  return {
    hasStopped: () => stopped,
    stop: (controls?: IScannerControls) => {
      if (controls && !stoppedControls.has(controls)) {
        stoppedControls.add(controls);
        try {
          controls.stop();
        } catch {
          // Track cleanup must continue even if ZXing's control is already closed.
        }
      }

      stopped = true;
      stopTracks();
    },
  };
}

export async function startQrScanner(
  video: HTMLVideoElement,
  onDetected: (code: string) => void,
): Promise<QrScannerSession> {
  assertCameraContext();

  const { BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = new BrowserQRCodeReader();
  const stopper = createStopper(video);
  let hasDetected = false;
  let controls: IScannerControls | undefined;

  try {
    const pendingControls = reader.decodeFromConstraints(
      {
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      },
      video,
      (result, error, callbackControls) => {
        if (error && isNotFoundScanError(error)) {
          return;
        }

        if (hasDetected || !result) {
          return;
        }

        const code = normalizeRedeemCode(result.getText());
        if (!isRedeemCode(code)) {
          return;
        }

        hasDetected = true;
        stopper.stop(callbackControls);
        onDetected(code);
      },
    );

    controls = await pendingControls;
    if (stopper.hasStopped()) {
      stopper.stop(controls);
    }

    return {
      stop: () => stopper.stop(controls),
    };
  } catch (error) {
    stopper.stop(controls);
    throw error;
  }
}
