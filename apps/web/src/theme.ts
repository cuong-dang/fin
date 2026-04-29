import {
  ActionIcon,
  Card,
  Container,
  createTheme,
  Group,
  Stack,
  Text,
} from "@mantine/core";

/**
 * App-wide Mantine theme. Extend component `defaultProps` here to make a
 * default the whole app inherits; call sites can still override per-use.
 */
export const theme = createTheme({
  components: {
    ActionIcon: ActionIcon.extend({
      defaultProps: {
        size: "xs",
        color: "black",
        variant: "subtle",
      },
    }),
    Card: Card.extend({
      defaultProps: {
        withBorder: true,
        padding: "xs",
      },
    }),
    Container: Container.extend({
      defaultProps: {
        size: "xs",
        p: "xs",
      },
    }),
    Group: Group.extend({
      defaultProps: {
        gap: "xs",
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
