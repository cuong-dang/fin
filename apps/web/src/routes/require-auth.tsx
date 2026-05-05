import { getToken, getWorkspaceId } from "@/lib/auth.js";

import { Navigate, Outlet } from "react-router";

/** Redirects to /signin if no token or no active workspace is selected. */
export function RequireAuth() {
  if (!getToken() || !getWorkspaceId())
    return <Navigate replace to="/signin" />;
  return <Outlet />;
}
