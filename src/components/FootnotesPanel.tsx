import { FOOTNOTE_CATEGORIES } from "../constants";
import type { FootnoteCategoryKey, FootnoteEntry } from "../types";

/** The four fixed footnote categories, with insert buttons and an editable
 * list of every footnote entered so far. Each entry has a checkbox that
 * controls whether it's included ("مُثبَتة") when the document is printed —
 * unchecking it never deletes the marker from the text, only excludes it
 * from print output. */
export function FootnotesPanel({
  entries,
  onInsert,
  onChangeText,
  onToggleInclude,
  activeId = null,
  onFocusEntry,
}: {
  entries: FootnoteEntry[];
  onInsert: (categoryKey: FootnoteCategoryKey) => void;
  onChangeText: (id: string, text: string) => void;
  onToggleInclude: (id: string) => void;
  activeId?: string | null;
  onFocusEntry?: (id: string) => void;
}) {
  const countFor = (key: FootnoteCategoryKey) =>
    entries.filter((e) => e.category === key).length;

  return (
    <div className="border-t border-border bg-paper-dim/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="text-xs font-semibold text-ink-soft">حواشي المتن:</span>
        {FOOTNOTE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            id={`footnote-insert-${cat.key}`}
            onClick={() => onInsert(cat.key)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-white/60 px-3 py-1 text-xs text-ink hover:bg-white"
            title={`إدراج حاشية: ${cat.label}`}
          >
            <span>{cat.label}</span>
            <span className="rounded-full bg-bronze-light/50 px-1.5 text-[10px] text-ink">
              {countFor(cat.key)}
            </span>
            <span className="text-bronze">＋</span>
          </button>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="max-h-72 overflow-auto border-t border-border/60 px-3 py-2">
          {FOOTNOTE_CATEGORIES.filter((cat) => countFor(cat.key) > 0).map((cat) => (
            <div key={cat.key} className="mb-3 last:mb-0 rounded-lg border border-border bg-white/70 p-2">
              <div className="mb-2 text-xs font-bold text-ink">{cat.label}</div>
              <div className="divide-y divide-border/50">
                {entries
                  .filter((e) => e.category === cat.key)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-2 py-2 first:pt-0 last:pb-0 ${
                        entry.includeInPrint ? "" : "opacity-50"
                      }`}
                    >
                      <span className="mt-2 shrink-0 text-xs font-semibold text-ink-soft">
                        {entry.index}.
                      </span>
                      <textarea
                        id={`footnote-input-${entry.id}`}
                        dir="rtl"
                        rows={2}
                        value={entry.text}
                        onChange={(e) => onChangeText(entry.id, e.target.value)}
                        onFocus={() => onFocusEntry?.(entry.id)}
                        placeholder="اكتب نص الحاشية هنا…"
                        className={`min-w-0 flex-1 resize-y rounded-md border border-border bg-white/80 p-2 font-naskh text-base leading-relaxed text-ink outline-none placeholder:text-ink-soft/50 ${
                          entry.id === activeId ? "ring-2 ring-bronze/60" : ""
                        }`}
                      />
                      <label
                        className="mt-1 flex shrink-0 flex-col items-center gap-0.5 text-[10px] text-ink-soft"
                        title="إثبات هذه الحاشية عند الطباعة"
                      >
                        <input
                          type="checkbox"
                          checked={entry.includeInPrint}
                          onChange={() => onToggleInclude(entry.id)}
                          className="h-3.5 w-3.5 accent-bronze"
                        />
                        <span>إثبات</span>
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
