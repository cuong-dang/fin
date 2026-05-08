import {
  ActionIcon,
  Card,
  createTheme,
  Group,
  NavLink,
  Stack,
  Text,
} from "@mantine/core";

export const theme = createTheme({
  components: {
    ActionIcon: ActionIcon.extend({
      defaultProps: {
        variant: "subtle",
      },
    }),
    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        padding: "xs",
      },
    }),
    Group: Group.extend({
      defaultProps: {
        gap: "xs",
      },
    }),
    NavLink: NavLink.extend({
      defaultProps: {
        px: "xs",
      },
    }),
    Stack: Stack.extend({
      defaultProps: {
        gap: "xs",
      },
    }),
    Text: Text.extend({
      defaultProps: {
        size: "sm",
      },
    }),
  },
});
