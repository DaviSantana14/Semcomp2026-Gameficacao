import "client-only";

import { ApiError } from "./api-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function downloadFile(path: string): Promise<void> {
  const response = await fetch(`${API_URL}${normalizePath(path)}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new ApiError(await getErrorMessage(response), response.status);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = getFilename(response.headers.get("Content-Disposition"));
  link.style.display = "none";
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) return data.message.join(" ");
    if (data.message) return data.message;
  } catch {
    return response.statusText;
  }

  return response.statusText;
}

function getFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return "download";

  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  const quoted = contentDisposition.match(/filename="([^"]+)"/i)?.[1];
  if (quoted) return quoted;

  return contentDisposition.match(/filename=([^;]+)/i)?.[1]?.trim() ?? "download";
}
