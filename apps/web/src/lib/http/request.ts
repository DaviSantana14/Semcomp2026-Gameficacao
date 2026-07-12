import "client-only";

import { ApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };

    if (Array.isArray(data.message)) return data.message.join(" ");
    if (data.message) return data.message;
  } catch {
    return response.statusText;
  }

  return response.statusText;
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
    throw new ApiError(await getErrorMessage(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
