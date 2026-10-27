import { useState } from "react";
import { SPECIAL_CHARS } from "../constants";

/** Insert-symbol button for classical Arabic editing marks — one button
 * opening a small grid, instead of every mark shown inline all the time. */
export function SpecialCharsToolbar({ onInsert }: { onInsert: (ch: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative border-b border-border bg-paper-dim/40 px-2 py-1">
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-white/60"
      >
        إدراج رمز ﴿ ﴾ ⌄
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 flex flex-wrap gap-1 rounded-md border border-border bg-white p-2 shadow-lg">
          {SPECIAL_CHARS.map((ch) => (
            <button
              key={ch}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onInsert(ch);
                setOpen(false);
              }}
              className="min-w-[28px] rounded-md px-1.5 py-0.5 font-naskh text-base text-ink hover:bg-paper-dim"
              title={`إدراج ${ch}`}
            >
              {ch}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
