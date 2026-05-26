const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type UserRole = "ADMIN" | "PARTICIPANT";

export type User = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type LoginPayload = {
  cpf: string;
  email: string;
};

export type RegisterPayload = LoginPayload & {
  name: string;
};

export type LoginResponse = {
  user: User;
  csrfToken: string;
};

export type CsrfTokenResponse = {
  csrfToken: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let csrfToken: string | null = null;

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };

    if (Array.isArray(data.message)) {
      return data.message.join(" ");
    }

    if (data.message) {
      return data.message;
    }
  } catch {
    return response.statusText;
  }

  return response.statusText;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipCsrf?: boolean } = {},
) {
  const method = options.method?.toUpperCase() ?? "GET";
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipCsrf && !["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_URL}${normalizePath(path)}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new ApiError(await getErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(payload: LoginPayload) {
  const response = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });

  setCsrfToken(response.csrfToken);

  return response;
}

export async function register(payload: RegisterPayload) {
  return apiFetch<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipCsrf: true,
  });
}

export async function fetchMe() {
  return apiFetch<User>("/users/me");
}

export async function fetchCsrfToken() {
  const response = await apiFetch<CsrfTokenResponse>("/auth/csrf");
  setCsrfToken(response.csrfToken);
  return response;
}
