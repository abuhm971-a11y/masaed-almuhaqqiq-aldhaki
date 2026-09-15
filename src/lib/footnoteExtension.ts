import { Node, mergeAttributes } from "@tiptap/core";

/**
 * An atomic, non-editable inline node representing a footnote reference
 * marker in the text. It only stores an id and a display number — the
 * footnote's actual category/text/print-inclusion live in React state
 * (the `footnotes` array in App), keyed by this id. Being a real
 * ProseMirror node (not a plain DOM element inserted via Range hacks)
 * means it moves correctly with the surrounding text through normal
 * editing, copy/paste, and undo/redo.
 */
export const FootnoteMark = Node.create({
  name: "footnoteMarker",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      footnoteId: { default: null },
      number: { default: 1 },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote-id]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, {
        "data-footnote-id": node.attrs.footnoteId,
        title: "انقر لتحرير نص الحاشية",
        class:
          "mx-0.5 cursor-pointer rounded bg-bronze-light/60 px-1 text-[11px] font-ui text-ink hover:bg-bronze-light",
      }),
      String(node.attrs.number),
    ];
  },
});
