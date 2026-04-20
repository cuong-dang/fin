import { Navigate, Outlet } from "react-router";
import { getGroupId, getToken } from "@/lib/auth";

/** Redirects to /signin if no token or no active workspace is selected. */
export function RequireAuth() {
  if (!getToken() || !getGroupId()) return <Navigate to="/signin" replace />;
  return <Outlet />;
}
