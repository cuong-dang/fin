import {
  ActionIcon,
  Container,
  createTheme,
  Group,
  Stack,
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
    Container: Container.extend({
      defaultProps: {
        size: "xs",
        p: "xs",
      },
    }),
    Group: Group.extend({
      defaultProps: {
        gap: "xs",
        px: "xs",
      },
    }),
    Stack: Stack.extend({
      defaultProps: {
        gap: "xs",
      },
    }),
  },
});
