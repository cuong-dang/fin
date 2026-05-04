import { getGroupId, getToken } from "@/lib/auth";

import { Navigate, Outlet } from "react-router";

/** Redirects to /signin if no token or no active workspace is selected. */
export function RequireAuth() {
  if (!getToken() || !getGroupId()) return <Navigate replace to="/signin" />;
  return <Outlet />;
}
