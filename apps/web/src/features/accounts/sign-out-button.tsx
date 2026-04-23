import { Button } from "@mantine/core";
import { useNavigate } from "react-router";
import { clearAuth } from "@/lib/auth";

export function SignOutButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="subtle"
      size="compact-xs"
      onClick={() => {
        clearAuth();
        navigate("/signin", { replace: true });
      }}
    >
      Sign out
    </Button>
  );
}
