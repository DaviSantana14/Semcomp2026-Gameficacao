import "client-only";

import { ApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

type ErrorResponse = {
  code?: unknown;
  message?: string | string[];
};

async function getErrorDetails(response: Response) {
  try {
    const data = (await response.json()) as ErrorResponse;

    const message = Array.isArray(data.message)
      ? data.message.join(" ")
      : data.message || response.statusText;
    const code = typeof data.code === "string" ? data.code : undefined;
    return { code, message };
  } catch {
    return { code: undefined, message: response.statusText };
  }
}

export async function request<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${normalizePath(path)}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const { code, message } = await getErrorDetails(response);
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
