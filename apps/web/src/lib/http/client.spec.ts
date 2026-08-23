import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeRequiredPassword,
  fetchSessionSecurity,
  login,
  logout,
} from "@/features/auth/auth.service";
import { resetParticipantPassword } from "@/features/participants/participants.service";
import { apiFetch } from "./client";
import { clearCsrfToken, setCsrfToken } from "./csrf";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch CSRF policy", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not load or send a CSRF token for safe methods", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch("/status");

    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(options?.headers).has("X-CSRF-Token")).toBe(false);
  });

  it("loads a token before the first unsafe request", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse({ created: true }, 201));

    await apiFetch("/items", { method: "POST" });

    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/auth/csrf");
    const [, options] = vi.mocked(fetch).mock.calls[1];
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
      "csrf-token",
    );
  });

  it("reuses an existing token", async () => {
    setCsrfToken("existing-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ updated: true }));

    await apiFetch("/items/1", { method: "PATCH" });

    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
      "existing-token",
    );
  });

  it("shares one token request between concurrent mutations", async () => {
    let resolveToken!: (response: Response) => void;
    const pendingToken = new Promise<Response>((resolve) => {
      resolveToken = resolve;
    });
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).endsWith("/auth/csrf")) return pendingToken;
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    const first = apiFetch("/first", { method: "POST" });
    const second = apiFetch("/second", { method: "PATCH" });
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledOnce();
    resolveToken(jsonResponse({ csrfToken: "shared-token" }));
    await Promise.all([first, second]);

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not let an older token request overwrite a new login token", async () => {
    let resolveOldToken!: (response: Response) => void;
    const oldTokenRequest = new Promise<Response>((resolve) => {
      resolveOldToken = resolve;
    });
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/csrf")) return oldTokenRequest;
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          jsonResponse({ user: { id: "user-1" }, csrfToken: "login-token" }),
        );
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    const pendingMutation = apiFetch("/first", { method: "POST" });
    await Promise.resolve();
    await login({ email: "user@example.test", password: "password123" });
    resolveOldToken(jsonResponse({ csrfToken: "old-token" }));
    await pendingMutation;
    await apiFetch("/second", { method: "POST" });

    const mutationCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => /\/(first|second)$/.test(String(input)));
    expect(mutationCalls).toHaveLength(2);
    for (const [, options] of mutationCalls) {
      expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
        "login-token",
      );
    }
  });

  it("allows another token load after a failed attempt", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: "unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "new-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(apiFetch("/items", { method: "POST" })).rejects.toThrow(
      "unauthorized",
    );
    await expect(
      apiFetch("/items", { method: "POST" }),
    ).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("honors skipCsrf for unsafe requests", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch("/public", { method: "POST", skipCsrf: true });

    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(options?.headers).has("X-CSRF-Token")).toBe(false);
  });
});

describe("authentication CSRF lifecycle", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("installs the token returned by login", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "user-1" }, csrfToken: "login-token" }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await login({ email: "user@example.test", password: "password123" });
    await apiFetch("/items", { method: "POST" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, options] = vi.mocked(fetch).mock.calls[1];
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
      "login-token",
    );
  });

  it("clears the token after a successful logout", async () => {
    setCsrfToken("old-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await logout();
    await apiFetch("/items", { method: "POST" });

    expect(vi.mocked(fetch).mock.calls[1][0]).toContain("/auth/csrf");
  });

  it("sends cookies and the CSRF token when logging out", async () => {
    setCsrfToken("logout-token");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await logout();

    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options?.credentials).toBe("include");
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
      "logout-token",
    );
  });

  it("keeps the token when logout fails", async () => {
    setCsrfToken("old-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: "failure" }, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(logout()).rejects.toThrow("failure");
    await apiFetch("/items", { method: "POST" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, options] = vi.mocked(fetch).mock.calls[1];
    expect(new Headers(options?.headers).get("X-CSRF-Token")).toBe(
      "old-token",
    );
  });
});

describe("HTTP response handling", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns undefined for a 204 response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiFetch("/empty")).resolves.toBeUndefined();
  });

  it("joins array error messages", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: ["first", "second"] }, 400),
    );

    await expect(apiFetch("/invalid")).rejects.toThrow("first second");
  });

  it("preserves a coded API error for feature-specific handling", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          statusCode: 403,
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "Defina uma nova senha para continuar.",
        },
        403,
      ),
    );

    await expect(apiFetch("/users/me")).rejects.toMatchObject({
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Defina uma nova senha para continuar.",
    });
  });

  it("sends the participant reset reason and replacement decision", async () => {
    setCsrfToken("csrf-token");
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        temporaryPassword: "temporary-password",
        expiresAt: "2026-08-24T12:00:00.000Z",
      }),
    );

    await resetParticipantPassword("participant-1", {
      reason: "Acesso administrativo solicitado",
      replacePending: true,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, options] = vi.mocked(fetch).mock.calls[0];
    expect(input).toContain("/admin/participants/participant-1/password-reset");
    expect(options?.method).toBe("POST");
    expect(options?.body).toBe(
      JSON.stringify({
        reason: "Acesso administrativo solicitado",
        replacePending: true,
      }),
    );
  });
});

describe("required password change transport", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("loads session security and installs the returned CSRF token", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ csrfToken: "session-token", passwordChangeRequired: true }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(fetchSessionSecurity()).resolves.toEqual({
      csrfToken: "session-token",
      passwordChangeRequired: true,
    });
    await apiFetch("/allowed-after-security", { method: "POST" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get("X-CSRF-Token")).toBe(
      "session-token",
    );
  });

  it("clears the client CSRF token only after a successful definitive change", async () => {
    setCsrfToken("temporary-session-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await changeRequiredPassword({ newPassword: "definitive-password" });
    await apiFetch("/after-password-change", { method: "POST" });

    expect(vi.mocked(fetch).mock.calls[1][0]).toContain("/auth/csrf");
    expect(new Headers(vi.mocked(fetch).mock.calls[2][1]?.headers).get("X-CSRF-Token")).toBe(
      "fresh-token",
    );
  });

  it("keeps the CSRF token when the definitive change fails", async () => {
    setCsrfToken("temporary-session-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "PASSWORD_MUST_CHANGE",
            message: "Escolha uma senha diferente da temporária.",
          },
          400,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(
      changeRequiredPassword({ newPassword: "temporary-password" }),
    ).rejects.toMatchObject({ code: "PASSWORD_MUST_CHANGE" });
    await apiFetch("/retry-password-change", { method: "POST" });

    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get("X-CSRF-Token")).toBe(
      "temporary-session-token",
    );
  });
});
