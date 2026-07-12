import "client-only";

import { request } from "./request";

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;
let sessionVersion = 0;

export function setCsrfToken(token: string) {
  sessionVersion += 1;
  csrfToken = token;
  csrfTokenRequest = null;
}

export function clearCsrfToken() {
  sessionVersion += 1;
  csrfToken = null;
  csrfTokenRequest = null;
}

export function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return Promise.resolve(csrfToken);
  if (csrfTokenRequest) return csrfTokenRequest;

  const requestVersion = sessionVersion;
  const pendingRequest = request<{ csrfToken: string }>("/auth/csrf").then(
    ({ csrfToken: token }) => {
      if (sessionVersion !== requestVersion) return csrfToken ?? token;
      csrfToken = token;
      return token;
    },
  );
  csrfTokenRequest = pendingRequest;
  void pendingRequest.then(clearPendingRequest, clearPendingRequest);

  return csrfTokenRequest;

  function clearPendingRequest() {
    if (csrfTokenRequest === pendingRequest) csrfTokenRequest = null;
  }
}
