import { createCn } from "cn/config";

// Registers the theme's font sizes, radii and shadows (src/index.css): otherwise `text-ui` reads
// as a colour and is dropped beside `text-foreground`, and a passed `rounded-card` would not win.
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
