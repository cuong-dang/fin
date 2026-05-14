import { clearAuth, getToken, getWorkspaceId } from "./auth.js";

// Base URL of the API. Empty in dev (Vite proxies `/api/*` to port
// 3001 so relative paths Just Work). In prod the SPA and API live on
// different Render hosts, so we bake the API host into the bundle at
// build time via `VITE_API_URL`.
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

class ApiError extends Error {
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

  const workspaceId = getWorkspaceId();
  if (workspaceId) headers.set("X-Workspace-Id", workspaceId);

  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }

  // `body` may legitimately be undefined (GET requests). With
  // `exactOptionalPropertyTypes`, RequestInit.body must be either
  // omitted or `BodyInit | null` — assigning `undefined` is a violation.
  // Conditional spread keeps the property out of the literal in that case.
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    ...(body !== undefined && { body }),
  });

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
