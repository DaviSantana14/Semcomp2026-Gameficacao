import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

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
});
