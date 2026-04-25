import { Alert } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { getGroupId, getToken, setGroupId, setToken } from "@/lib/auth";
import { me } from "@/lib/endpoints";

/**
 * Captures #token=... from the URL fragment set by the server's OAuth
 * callback redirect, stores it in localStorage, then fetches /me to learn
 * which workspaces the user belongs to and stashes a default group id
 * before navigating home.
 *
 * StrictMode idempotency: the first effect run reads the fragment, stores
 * the token, and strips the fragment from the URL. The second run sees an
 * empty fragment but reads the stored token back from localStorage — so
 * we decide "signed in?" from storage, never from the fragment's presence.
 * Without that, run 2 would wrongly bounce the user to /signin.
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

    // Short-circuit if already bootstrapped — e.g., user refreshes
    // /auth/callback after the first visit completed. Avoids a redundant
    // /me round-trip. (Doesn't apply to StrictMode's double-effect, since
    // both runs fire before the first's /me resolves.)
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

  if (error) return <Alert color="red">Auth failed: {error}</Alert>;
  return null;
}
