import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRedeemCode, normalizeRedeemCode } from "./redeem-code.validation";
import { startQrScanner } from "./qr-scanner";

const zxing = vi.hoisted(() => {
  const decodeFromConstraints = vi.fn();
  const BrowserQRCodeReader = vi.fn(function BrowserQRCodeReader(this: {
    decodeFromConstraints: typeof decodeFromConstraints;
  }) {
    this.decodeFromConstraints = decodeFromConstraints;
  });

  return {
    BrowserQRCodeReader,
    decodeFromConstraints,
  };
});

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: zxing.BrowserQRCodeReader,
}));

function createVideo() {
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  const video = document.createElement("video");
  vi.spyOn(video, "pause").mockImplementation(() => undefined);

  Object.defineProperty(video, "srcObject", {
    configurable: true,
    value: stream,
    writable: true,
  });

  return { track, video };
}

describe("redeem code validation", () => {
  it("normalizes the same format used by manual and camera entry", () => {
    expect(normalizeRedeemCode("  abcd-efgh\n")).toBe("ABCD-EFGH");
    expect(isRedeemCode("ABCD-EFGH")).toBe(true);
    expect(isRedeemCode("https://example.com/claim/ABCD-EFGH")).toBe(false);
  });
});

describe("startQrScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "localhost" },
    });
  });

  it("starts with the rear camera, accepts the first valid result and cleans every track", async () => {
    const { track, video } = createVideo();
    const controls = { stop: vi.fn() };
    let decodeCallback!: (
      result: { getText: () => string } | undefined,
      error: unknown,
      callbackControls: typeof controls,
    ) => void;
    zxing.decodeFromConstraints.mockImplementation(
      async (_constraints, _video, callback) => {
        decodeCallback = callback;
        return controls;
      },
    );
    const onDetected = vi.fn();

    const session = await startQrScanner(video, onDetected);

    expect(zxing.decodeFromConstraints).toHaveBeenCalledWith(
      {
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      },
      video,
      expect.any(Function),
    );

    decodeCallback({ getText: () => " abcd-efgh " }, undefined, controls);
    decodeCallback({ getText: () => "IJKL-MNOP" }, undefined, controls);

    expect(onDetected).toHaveBeenCalledOnce();
    expect(onDetected).toHaveBeenCalledWith("ABCD-EFGH");
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();

    session.stop();
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("keeps invalid payloads in the scanner and ignores normal scan misses", async () => {
    const { track, video } = createVideo();
    const controls = { stop: vi.fn() };
    let decodeCallback!: (
      result: { getText: () => string } | undefined,
      error: unknown,
      callbackControls: typeof controls,
    ) => void;
    zxing.decodeFromConstraints.mockImplementation(
      async (_constraints, _video, callback) => {
        decodeCallback = callback;
        return controls;
      },
    );
    const onDetected = vi.fn();

    await startQrScanner(video, onDetected);

    decodeCallback(
      { getText: () => "https://example.com/claim/ABCD-EFGH" },
      undefined,
      controls,
    );
    decodeCallback(undefined, { name: "NotFoundException" }, controls);

    expect(onDetected).not.toHaveBeenCalled();
    expect(controls.stop).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("releases media tracks even when the ZXing control throws during stop", async () => {
    const { track, video } = createVideo();
    const controls = {
      stop: vi.fn(() => {
        throw new Error("ZXing cleanup failed");
      }),
    };
    zxing.decodeFromConstraints.mockResolvedValueOnce(controls);

    const session = await startQrScanner(video, vi.fn());

    expect(() => session.stop()).not.toThrow();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("rejects insecure non-localhost contexts before asking the reader for permission", async () => {
    const { video } = createVideo();
    vi.stubGlobal("window", {
      isSecureContext: false,
      location: { hostname: "semcomp.example" },
    });

    await expect(startQrScanner(video, vi.fn())).rejects.toThrow("HTTPS");
    expect(zxing.BrowserQRCodeReader).not.toHaveBeenCalled();
    expect(zxing.decodeFromConstraints).not.toHaveBeenCalled();
  });

  it("propagates permission and device failures so the dialog can explain them", async () => {
    const { video } = createVideo();
    const error = new DOMException("Permission denied", "NotAllowedError");
    zxing.decodeFromConstraints.mockRejectedValueOnce(error);

    await expect(startQrScanner(video, vi.fn())).rejects.toBe(error);
  });
});
