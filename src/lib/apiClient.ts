export type FieldDetail = { path: string; message: string };

export class ClientApiError extends Error {
  constructor(
    public status: number, // 0 = network failure
    public code: string,
    message: string,
    public details: FieldDetail[] = [],
    public requestId?: string
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; idempotencyKey?: string };

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ClientApiError(0, "NETWORK_ERROR", "Network error. Check your connection.");
  }

  if (res.status === 401 && !location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ClientApiError(
      res.status,
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "Request failed",
      e?.details ?? [],
      e?.requestId
    );
  }
  return json as T;
}