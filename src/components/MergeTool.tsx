import { useState } from "react";
import { assembleApproved, buildMergePreview, findOrderCollisions } from "../lib/pageOrder";
import type { RegisteredCopy } from "../types";

/** The staged-merge tool: lists every registered page from both panels,
 * sorted by side then orderKey, flags any unapproved page as a gap, and
 * only inserts the approved pages into the editor — in order — once the
 * user explicitly confirms after reviewing this preview. This is what
 * lets a researcher transcribe/approve pages one at a time (avoiding
 * whole-book-at-once OCR risk) while still guaranteeing a correct final
 * assembly. */
export function MergeTool({
  copies,
  onMerge,
}: {
  copies: RegisteredCopy[];
  onMerge: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Every registered page is shown (including unapproved ones, as flagged
  // gaps) so nothing is silently skipped when merging.
  const ordered = buildMergePreview(copies);
  const collisions = findOrderCollisions(copies);
  const approvedCount = ordered.filter((r) => !r.isGap).length;

  const confirmMerge = () => {
    onMerge(assembleApproved(copies));
    setOpen(false);
  };

  return (
    <div className="border-t border-border bg-paper-dim/40 px-3 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={copies.length === 0}
        className="rounded-md border border-border bg-white/60 px-3 py-1 text-xs text-ink hover:bg-white disabled:opacity-40"
      >
        دمج الصفحات المعتمدة ومعاينتها
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-white/70 p-2">
          {collisions.length > 0 && (
            <p className="mb-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              ⚠ صفحتان أو أكثر تشتركان في الترتيب نفسه ({collisions.join("، ")}) — راجع الترتيب قبل الدمج.
            </p>
          )}
          <ol dir="rtl" className="max-h-48 space-y-1 overflow-auto text-xs">
            {ordered.map((c) => (
              <li
                key={`${c.side}-${c.id}`}
                className={`flex items-center justify-between rounded px-2 py-1 ${
                  c.status === "approved"
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                <span>
                  {c.side === "manuscript" ? "المخطوط" : "المطبوعة"} — نسخة {c.label} (ترتيب {c.orderKey})
                </span>
                <span>
                  {c.status === "approved"
                    ? `${c.firstWord} … ${c.lastWord}`
                    : "⚠ غير معتمدة — فجوة"}
                </span>
              </li>
            ))}
          </ol>
          <button
            onClick={confirmMerge}
            disabled={approvedCount === 0}
            className="mt-2 rounded-md bg-bronze px-3 py-1 text-xs text-white hover:bg-bronze/90 disabled:opacity-40"
          >
            تأكيد الدمج وإدراجه في النص
          </button>
        </div>
      )}
    </div>
  );
}
