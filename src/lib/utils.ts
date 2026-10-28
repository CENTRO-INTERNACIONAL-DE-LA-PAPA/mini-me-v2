import { createCn } from "cn/config";

// The theme in src/index.css adds these font sizes, radii and shadows. Without registering
// them, `text-ui` would be taken for a text colour and dropped when merged with
// `text-foreground`, and a `rounded-card` passed in would not replace a component's own radius.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "meta",
            "control",
            "ui",
            "document",
            "body",
            "reply",
            "section",
            "lead",
            "header",
            "page",
            "display",
            "subheading",
            "name",
            "heading",
            "card-title",
            "tool-title",
            "nav-project",
            "column-title",
            "identity",
            "sheet-title",
            "greeting",
          ],
        },
      ],
      rounded: [{ rounded: ["control", "well", "card", "sheet", "composer"] }],
      shadow: [{ shadow: ["composer", "float", "window", "sheet", "raised", "floating"] }],
    },
  },
});
