import { Anchor } from "@mantine/core";
import { Link } from "react-router";

/**
 * "← Back" link — subtle and flush to the left edge. Pass either a
 * destination URL (`to`) for a real link, or an `onClick` handler when
 * the caller wants to go back via browser history (`navigate(-1)`).
 */
type BackLinkProps = { to: string } | { onClick: () => void };

export function BackLink(props: BackLinkProps) {
  if ("onClick" in props) {
    return (
      <Anchor
        c="dimmed"
        component="button"
        size="sm"
        // Without this, <button>'s default `text-align: center` shows
        // through when the Stack parent stretches it to full width;
        // the Link variant renders as <a> which defaults to left.
        style={{ textAlign: "left" }}
        type="button"
        onClick={props.onClick}
      >
        ← Back
      </Anchor>
    );
  }
  return (
    <Anchor c="dimmed" component={Link} size="sm" to={props.to}>
      ← Back
    </Anchor>
  );
}
