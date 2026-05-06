import { createTheme, Group, Stack } from "@mantine/core";

export const theme = createTheme({
  components: {
    // ActionIcon: ActionIcon.extend({
    //   defaultProps: {
    //     size: "xs",
    //     variant: "subtle",
    //   },
    // }),
    // Card: Card.extend({
    //   defaultProps: {
    //     withBorder: true,
    //     padding: "xs",
    //   },
    // }),
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
    // Text: Text.extend({
    //   defaultProps: {
    //     size: "sm",
    //   },
    // }),
  },
});
