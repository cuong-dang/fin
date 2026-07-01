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
      // Mantine's Card clips with `overflow: hidden`, which cuts off
      // chart tooltips (a tall category breakdown extends past the card
      // edge). Nothing here relies on the clip — we use no `Card.Section`
      // — so let content escape and tooltips render in full.
      styles: {
        root: { overflow: "visible" },
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
