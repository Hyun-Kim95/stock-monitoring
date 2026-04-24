const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function adminHeaders(): HeadersInit {
  const t = process.env.NEXT_PUBLIC_ADMIN_TOKEN;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export type ApiGetOptions = { admin?: boolean };

export async function apiGet<T>(path: string, options?: ApiGetOptions): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: options?.admin ? { ...adminHeaders() } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError("요청 실패", res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T | void> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...adminHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return;
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new ApiError("요청 실패", res.status, b);
  }
  return res.json() as Promise<T>;
}

export { base as apiBase };
