import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading2,
  Italic,
  List,
  ListOrdered,
  MoreHorizontal,
  Pilcrow,
  Underline,
} from "lucide-react";
import { useState } from "react";

/** Formatting toolbar for the main editor — the full set of common
 * actions shown directly in one row (only "remove formatting", a rare
 * action, is tucked behind "…"), per the standard toolbar convention:
 * fold only what's genuinely rare, not most of the bar. Calls real
 * TipTap (ProseMirror) commands directly on the editor instance. */
export function FormatToolbar({ editor }: { editor: Editor | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!editor) return null;

  const GROUPS: { title: string; Icon: typeof Bold; run: () => void }[][] = [
    [
      { title: "عريض", Icon: Bold, run: () => editor.chain().focus().toggleBold().run() },
      { title: "مائل", Icon: Italic, run: () => editor.chain().focus().toggleItalic().run() },
      { title: "تسطير", Icon: Underline, run: () => editor.chain().focus().toggleUnderline().run() },
    ],
    [
      { title: "محاذاة يمين", Icon: AlignRight, run: () => editor.chain().focus().setTextAlign("right").run() },
      { title: "محاذاة وسط", Icon: AlignCenter, run: () => editor.chain().focus().setTextAlign("center").run() },
      { title: "محاذاة يسار", Icon: AlignLeft, run: () => editor.chain().focus().setTextAlign("left").run() },
      { title: "ضبط", Icon: AlignJustify, run: () => editor.chain().focus().setTextAlign("justify").run() },
    ],
    [
      { title: "قائمة نقطية", Icon: List, run: () => editor.chain().focus().toggleBulletList().run() },
      { title: "قائمة مرقّمة", Icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run() },
    ],
    [
      { title: "عنوان", Icon: Heading2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
      { title: "نص عادي", Icon: Pilcrow, run: () => editor.chain().focus().setParagraph().run() },
    ],
  ];

  return (
    <div className="relative flex flex-wrap items-center gap-1 border-b border-border bg-paper-dim/40 px-2 py-1">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center overflow-hidden rounded-md border border-border/70">
          {group.map((b) => (
            <button
              key={b.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={b.run}
              title={b.title}
              className="flex h-7 w-7 items-center justify-center text-ink-soft hover:bg-white/60"
            >
              <b.Icon size={14} />
            </button>
          ))}
        </div>
      ))}

      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenuOpen((v) => !v)}
        title="إزالة التنسيق"
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-white/60"
      >
        <MoreHorizontal size={15} />
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-white py-1 shadow-lg">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().unsetAllMarks().clearNodes().run();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-xs text-ink hover:bg-paper-dim"
          >
            <Eraser size={13} className="text-ink-soft" />
            إزالة كل التنسيق
          </button>
        </div>
      )}
    </div>
  );
}
