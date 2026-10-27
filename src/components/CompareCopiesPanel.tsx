import { useMemo, useState } from "react";
import { diffWords, groupDiffOps } from "../lib/diff";
import type { FootnoteCategoryKey, RegisteredCopy } from "../types";

/** The actual core "فروق النسخ" (variant-copy collation) tool: pick any
 * two OCR'd copies (from either the manuscript or printed panel), see a
 * word-level diff between them, and turn each difference into a tagged
 * "فروق النسخ" footnote with one tap — the specific, named-copy variant
 * apparatus that real tahqiq methodology requires, not a generic
 * "compare tool". */
export function CompareCopiesPanel({
  copies,
  onInsertFootnote,
}: {
  copies: RegisteredCopy[];
  onInsertFootnote: (categoryKey: FootnoteCategoryKey, presetText: string) => void;
}) {
  const [keyA, setKeyA] = useState("");
  const [keyB, setKeyB] = useState("");

  const sideLabel = (s: "manuscript" | "printed") => (s === "manuscript" ? "المخطوط" : "المطبوعة");
  const optionLabel = (t: RegisteredCopy) => `${sideLabel(t.side)} – ${t.label}`;
  const compositeKey = (t: { side: string; id: string }) => `${t.side}-${t.id}`;

  const withText = copies.filter((c) => c.transcript);
  const a = withText.find((t) => compositeKey(t) === keyA);
  const b = withText.find((t) => compositeKey(t) === keyB);

  const groups = useMemo(() => {
    if (!a || !b) return null;
    return groupDiffOps(diffWords(a.transcript, b.transcript));
  }, [a, b]);

  return (
    <div className="border-t border-border bg-paper-dim/50 px-3 py-2">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-ink-soft">مقابلة النسخ:</span>
        <select
          value={keyA}
          onChange={(e) => setKeyA(e.target.value)}
          className="rounded-md border border-border bg-white/70 px-1.5 py-0.5 text-ink"
        >
          <option value="">— اختر نسخة —</option>
          {withText.map((t) => (
            <option key={compositeKey(t)} value={compositeKey(t)}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
        <span className="text-ink-soft">مقابل</span>
        <select
          value={keyB}
          onChange={(e) => setKeyB(e.target.value)}
          className="rounded-md border border-border bg-white/70 px-1.5 py-0.5 text-ink"
        >
          <option value="">— اختر نسخة —</option>
          {withText.map((t) => (
            <option key={compositeKey(t)} value={compositeKey(t)}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {withText.length === 0 && (
        <p className="text-xs text-ink-soft">
          استورد صورًا في لوح المخطوط أو المطبوعة أولًا حتى تُفرَّغ نصيًا وتظهر هنا للمقابلة.
        </p>
      )}

      {groups && (
        <div dir="rtl" className="max-h-40 overflow-auto rounded-md border border-border bg-white/70 p-2 font-naskh text-sm leading-relaxed">
          {groups.map((g, i) =>
            g.equal !== undefined ? (
              <span key={i} className="text-ink">{g.equal}</span>
            ) : (
              <span key={i} className="mx-0.5 inline-flex items-center gap-1 rounded bg-bronze-light/40 px-1">
                {g.removed && (
                  <span className="text-red-700 line-through">{g.removed}</span>
                )}
                {g.added && <span className="text-marginalia">{g.added}</span>}
                <button
                  onClick={() =>
                    onInsertFootnote(
                      "furuq",
                      b && a
                        ? `في نسخة (${b.label}): ${g.added || "سقط"}${g.removed ? ` بدل (${g.removed})` : ""}`
                        : ""
                    )
                  }
                  title="تحويل هذا الفرق إلى حاشية فروق نسخ عند موضع المؤشر"
                  className="rounded-full bg-bronze px-1.5 text-[10px] text-white hover:bg-bronze/90"
                >
                  ＋حاشية
                </button>
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
