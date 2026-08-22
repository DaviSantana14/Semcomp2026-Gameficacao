import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { clearCsrfToken } from "@/lib/http/csrf";
import { sendHeartbeat } from "@/features/presence/presence.service";
import { usePresenceHeartbeat } from "./use-presence-heartbeat";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/features/presence/presence.service", () => ({
  sendHeartbeat: vi.fn(),
}));

vi.mock("@/lib/http/csrf", () => ({
  clearCsrfToken: vi.fn(),
}));

const sendHeartbeatMock = vi.mocked(sendHeartbeat);
const clearCsrfTokenMock = vi.mocked(clearCsrfToken);

describe("usePresenceHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sendHeartbeatMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends immediately and once per minute", async () => {
    renderHook(() => usePresenceHeartbeat());

    expect(sendHeartbeatMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);

    expect(sendHeartbeatMock).toHaveBeenCalledTimes(3);
  });

  it("skips a timer tick while a heartbeat is in flight", async () => {
    let resolveHeartbeat!: () => void;
    sendHeartbeatMock.mockImplementation(
      () => new Promise<void>((resolve) => (resolveHeartbeat = resolve)),
    );

    renderHook(() => usePresenceHeartbeat());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sendHeartbeatMock).toHaveBeenCalledTimes(1);

    resolveHeartbeat();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sendHeartbeatMock).toHaveBeenCalledTimes(2);
  });

  it("aborts the current request and clears the interval on unmount", async () => {
    const { unmount } = renderHook(() => usePresenceHeartbeat());
    const signal = sendHeartbeatMock.mock.calls[0]?.[0];

    expect(signal).toBeInstanceOf(AbortSignal);

    unmount();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(signal?.aborted).toBe(true);
    expect(sendHeartbeatMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("silently ignores transient failures", async () => {
    sendHeartbeatMock.mockRejectedValue(new ApiError("Indisponível", 503));

    renderHook(() => usePresenceHeartbeat());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sendHeartbeatMock).toHaveBeenCalledTimes(2);
    expect(clearCsrfTokenMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("clears CSRF state and redirects to login on unauthorized responses", async () => {
    sendHeartbeatMock.mockRejectedValue(new ApiError("Sessão expirada", 401));

    renderHook(() => usePresenceHeartbeat());
    await vi.advanceTimersByTimeAsync(0);

    expect(clearCsrfTokenMock).toHaveBeenCalledOnce();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });
});
