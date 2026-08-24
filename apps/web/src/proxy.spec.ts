import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  const originalAuthProxyEnabled = process.env.AUTH_PROXY_ENABLED;

  afterEach(() => {
    if (originalAuthProxyEnabled === undefined) {
      delete process.env.AUTH_PROXY_ENABLED;
    } else {
      process.env.AUTH_PROXY_ENABLED = originalAuthProxyEnabled;
    }
  });

  it("direciona acesso administrativo sem sessão ao login administrativo", () => {
    const response = proxy(new NextRequest("http://semcomp.test/admin"));

    expect(response.headers.get("location")).toBe(
      "http://semcomp.test/login/admin",
    );
  });

  it("mantém o login de participante para áreas de participante", () => {
    const response = proxy(new NextRequest("http://semcomp.test/home"));

    expect(response.headers.get("location")).toBe("http://semcomp.test/login");
  });

  it("mantém a ativação administrativa pública", () => {
    const response = proxy(new NextRequest("http://semcomp.test/ativar-admin"));

    expect(response.headers.get("location")).toBeNull();
    expect(config.matcher).toContain("/ativar-admin");
  });

  it("requires a session for the required password change page", () => {
    const response = proxy(new NextRequest("http://semcomp.test/trocar-senha"));

    expect(response.headers.get("location")).toBe("http://semcomp.test/login");
    expect(config.matcher).toContain("/trocar-senha");
  });

  it("allows a session to reach the required password change page", () => {
    const request = new NextRequest("http://semcomp.test/trocar-senha", {
      headers: { Cookie: "access_token=session-token" },
    });

    expect(proxy(request).headers.get("location")).toBeNull();
  });
});
