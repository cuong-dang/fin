import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { clearAuth } from "@/lib/auth";

export function SignOutButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => {
        clearAuth();
        navigate("/signin", { replace: true });
      }}
    >
      Sign out
    </Button>
  );
}
