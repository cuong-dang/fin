import { clearAuth, getGroupId, getToken } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Fetch wrapper. Attaches bearer auth, JSON-encodes bodies, parses JSON
 * responses. Throws ApiError on non-2xx with server's error message.
 * 204 responses return undefined.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const groupId = getGroupId();
  if (groupId) headers.set("X-Group-Id", groupId);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  const res = await fetch(path, { ...init, headers, body });

  if (res.status === 401) {
    clearAuth();
    // Let the router handle redirect via a thrown error.
    throw new ApiError(401, "Unauthorized");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}
