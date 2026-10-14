import { createCn } from "cn/config";

// The theme in src/index.css adds these font sizes and shadows. Without registering them,
// `text-ui` would be taken for a text colour and dropped when merged with `text-foreground`.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["meta", "ui", "document", "body", "section", "lead", "header", "page", "display"] },
      ],
      shadow: [{ shadow: ["composer", "float", "window"] }],
    },
  },
});
