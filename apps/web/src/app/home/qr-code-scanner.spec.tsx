import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QrCodeScanner } from "./qr-code-scanner";

const startQrScannerMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/actions/qr-scanner", () => ({
  startQrScanner: startQrScannerMock,
}));

describe("QrCodeScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not request the camera until it is explicitly activated", async () => {
    const onDetected = vi.fn();
    const onError = vi.fn();
    const onStarted = vi.fn();
    const stop = vi.fn();
    startQrScannerMock.mockResolvedValue({ stop });
    const { rerender } = render(
      <QrCodeScanner
        isActive={false}
        onDetected={onDetected}
        onError={onError}
        onStarted={onStarted}
      />,
    );

    expect(startQrScannerMock).not.toHaveBeenCalled();

    rerender(
      <QrCodeScanner
        isActive
        onDetected={onDetected}
        onError={onError}
        onStarted={onStarted}
      />,
    );

    await waitFor(() => {
      expect(startQrScannerMock).toHaveBeenCalledWith(
        expect.any(HTMLVideoElement),
        expect.any(Function),
      );
      expect(onStarted).toHaveBeenCalledOnce();
    });
    const detectedCallback = startQrScannerMock.mock.calls[0]?.[1];
    detectedCallback?.("ABCD-EFGH");
    expect(onDetected).toHaveBeenCalledWith("ABCD-EFGH");
    expect(screen.getByLabelText("Prévia da câmera")).toBeInTheDocument();

    rerender(
      <QrCodeScanner
        isActive={false}
        onDetected={onDetected}
        onError={onError}
        onStarted={onStarted}
      />,
    );
    expect(stop).toHaveBeenCalledOnce();
  });

  it("reports permission and device errors without leaving a session behind", async () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    const onError = vi.fn();
    startQrScannerMock.mockRejectedValue(error);

    const { unmount } = render(
      <QrCodeScanner
        isActive
        onDetected={vi.fn()}
        onError={onError}
        onStarted={vi.fn()}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    unmount();
    expect(onError).toHaveBeenCalledOnce();
  });
});
