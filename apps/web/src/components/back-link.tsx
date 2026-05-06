import { Anchor } from "@mantine/core";
import { useNavigate } from "react-router";

export function BackLink() {
  const navigate = useNavigate();
  return (
    <Anchor c="dimmed" component="button" onClick={() => navigate(-1)}>
      ← Back
    </Anchor>
  );
}
