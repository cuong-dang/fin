import { Button } from "@mantine/core";
import { useNavigate } from "react-router";
import { clearAuth } from "@/lib/auth";

export function SignOutButton() {
  const navigate = useNavigate();
  return (
    <Button
      size="xs"
      color="black"
      variant="subtle"
      onClick={() => {
        clearAuth();
        navigate("/signin", { replace: true });
      }}
    >
      Sign out
    </Button>
  );
}
