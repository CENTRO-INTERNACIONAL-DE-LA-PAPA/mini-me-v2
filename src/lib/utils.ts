import { createCn } from "cn/config";

// Registers the theme's font sizes (src/index.css): otherwise `text-ui` reads as a colour and is
// dropped beside `text-foreground`.
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
            "section",
            "lead",
            "subheading",
            "name",
            "heading",
            "tool-title",
            "column-title",
            "identity",
            "sheet-title",
            "greeting",
          ],
        },
      ],
    },
  },
});
