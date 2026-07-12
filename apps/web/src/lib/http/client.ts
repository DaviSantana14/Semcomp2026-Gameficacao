import "client-only";

import { ensureCsrfToken } from "./csrf";
import { request } from "./request";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type ApiFetchOptions = RequestInit & { skipCsrf?: boolean };

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
) {
  const { skipCsrf = false, ...requestOptions } = options;
  const method = requestOptions.method?.toUpperCase() ?? "GET";
  const headers = new Headers(requestOptions.headers);

  if (!skipCsrf && !SAFE_METHODS.has(method)) {
    headers.set("X-CSRF-Token", await ensureCsrfToken());
  }

  return request<T>(path, { ...requestOptions, method, headers });
}
