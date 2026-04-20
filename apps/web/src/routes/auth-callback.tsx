import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getGroupId, getToken, setGroupId, setToken } from "@/lib/auth";
import { me } from "@/lib/endpoints";

/**
 * Captures #token=... from the URL fragment set by the server's OAuth
 * callback redirect. Then fetches /me to learn which workspaces the user
 * belongs to, stores the default group id, and navigates home.
 *
 * Idempotent across StrictMode's double-effect: after the first run we've
 * stashed the token and (usually) the group id, so the second run sees an
 * empty fragment but still has both in storage and routes to home.
 */
export function AuthCallbackRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = hash.get("token");
    if (fragmentToken) {
      setToken(fragmentToken);
      window.history.replaceState(null, "", "/auth/callback");
    }

    const token = getToken();
    if (!token) {
      navigate("/signin", { replace: true });
      return;
    }

    // Already bootstrapped (StrictMode second run or a refresh mid-flow).
    if (getGroupId()) {
      navigate("/", { replace: true });
      return;
    }

    me()
      .then(({ groups }) => {
        if (groups.length === 0) {
          throw new Error("No workspace found for this user");
        }
        setGroupId(groups[0].id);
        navigate("/", { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [navigate]);

  if (error) return <p className="p-4 text-red-600">Auth failed: {error}</p>;
  return null;
}
