import { useRef, useState } from "react";
import { FileText, RotateCw, Scissors, Upload } from "lucide-react";
import { COPY_LABELS, IMAGE_NOTE_CATEGORIES } from "../constants";
import { makeEmptyCopy } from "../lib/copies";
import { splitOrderKey } from "../lib/pageOrder";
import { useArchiveSync } from "../lib/useArchiveSync";
import { cropImageHalves, dataUrlToFile, rotateImage90 } from "../lib/imageOps";
import { transcribeImage } from "../lib/supabaseClient";
import type {
  Copy,
  ImageNoteCategoryKey,
  ImageNoteEntry,
  PanelSide,
  PanelState,
} from "../types";

/** A side panel (manuscript image or printed image). Collapses to a closed
 * vertical strip and can be hidden entirely. Never affects the center panel's
 * guaranteed minimum width. Holds one or more named copies (أ، ب، ج…) as
 * tabs within itself — every copy is OCR'd automatically via the AI
 * `transcribe` function as soon as it's added, but the result is only a
 * reviewable draft until merged in explicitly via the merge tool. */
export function SidePanel({
  side,
  title,
  state,
  width,
  onExpand,
  onCollapse,
  onHide,
  scrollRef,
  onScroll,
  onCopyUpdate,
}: {
  side: PanelSide;
  title: string;
  state: PanelState;
  width: number;
  onExpand: () => void;
  onCollapse: () => void;
  onHide: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
  onCopyUpdate: (copy: {
    id: string;
    label: string;
    orderKey: number;
    status: "not_transcribed" | "draft" | "approved";
    transcript: string;
  }) => void;
}) {
  const [copies, setCopies] = useState<Copy[]>([makeEmptyCopy(COPY_LABELS[0], 1)]);
  const [activeCopyId, setActiveCopyId] = useState(copies[0].id);
  const active = copies.find((c) => c.id === activeCopyId) ?? copies[0];

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

  const reportCopy = (c: Copy) => {
    onCopyUpdate({
      id: c.id,
      label: c.label,
      orderKey: c.orderKey,
      status: c.approved ? "approved" : c.transcript ? "draft" : "not_transcribed",
      transcript: c.transcript,
    });
  };

  const updateCopy = (id: string, patch: Partial<Copy>) => {
    setCopies((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        reportCopy(next);
        return next;
      })
    );
  };

  useArchiveSync(side === "right" ? "manuscript" : "printed", copies, (restored) => {
    setCopies(restored);
    setActiveCopyId(restored[0].id);
    restored.forEach(reportCopy);
  });

  const nextOrderKey = () =>
    copies.length ? Math.max(...copies.map((c) => c.orderKey)) + 1 : 1;

  const addCopy = () => {
    const nextLabel = COPY_LABELS[copies.length] ?? `نسخة ${copies.length + 1}`;
    const newCopy = makeEmptyCopy(nextLabel, nextOrderKey());
    setCopies((prev) => [...prev, newCopy]);
    setActiveCopyId(newCopy.id);
    reportCopy(newCopy);
  };

  const addNote = (categoryKey: ImageNoteCategoryKey) => {
    const nextIndex = active.notes.filter((n) => n.category === categoryKey).length + 1;
    const newNote: ImageNoteEntry = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: categoryKey,
      index: nextIndex,
      text: "",
    };
    updateCopy(active.id, { notes: [...active.notes, newNote] });
  };
  const updateNoteText = (noteId: string, text: string) => {
    updateCopy(active.id, {
      notes: active.notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
    });
  };

  const runTranscription = async (id: string, file: File) => {
    updateCopy(id, { busy: true, error: null, approved: false });
    try {
      const recognized = await transcribeImage(file);
      updateCopy(id, { transcript: recognized });
      // Deliberately NOT inserted into the main editor here — it becomes a
      // reviewable draft; the user approves it below, then uses the merge
      // tool to insert approved pages in order.
    } catch (err) {
      updateCopy(id, {
        error: err instanceof Error ? err.message : "تعذّر تفريغ النص من الصورة",
      });
    } finally {
      updateCopy(id, { busy: false });
    }
  };

  const handleFile = async (file: File) => {
    const id = active.id;
    if (active.imageUrl) URL.revokeObjectURL(active.imageUrl);
    updateCopy(id, { fileName: file.name, error: null, crops: null, splitMode: false });

    if (!file.type.startsWith("image/")) {
      updateCopy(id, { imageUrl: null });
      // PDF/ZIP splitting into pages isn't built yet — see README.
      return;
    }

    updateCopy(id, { imageUrl: URL.createObjectURL(file) });
    await runTranscription(id, file);
  };

  /** Pointer-based (not mouse-only) drag for the split divider, so it
   * works with touch input on mobile, not just a mouse. */
  const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingSplit.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  };
  const onSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplit.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    updateCopy(active.id, { splitX: Math.min(95, Math.max(5, pct)) });
  };
  const endSplitDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingSplit.current = false;
    document.body.style.cursor = "";
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const runSplit = async () => {
    const id = active.id;
    if (!active.imageUrl) return;
    updateCopy(id, { error: null });
    try {
      updateCopy(id, { crops: await cropImageHalves(active.imageUrl, active.splitX) });
    } catch (err) {
      updateCopy(id, { error: err instanceof Error ? err.message : "تعذّر تقطيع الصورة" });
    }
  };

  /** Applies one crop as this copy's image (keeps this copy's orderKey —
   * it's the "right" position). The OTHER half is never discarded — it
   * becomes a new copy tab positioned midway between this page and the
   * next one (splitOrderKey), so it sits correctly without renumbering
   * anything else — even when an already-split page is split again. */
  const useCrop = async (which: "left" | "right") => {
    const id = active.id;
    if (!active.crops) return;
    const other = which === "left" ? "right" : "left";
    const baseName = (active.fileName ?? "page").replace(/\.[^.]+$/, "");

    const chosenFile = await dataUrlToFile(active.crops[which], `${baseName}-${which}.png`);
    const otherFile = await dataUrlToFile(active.crops[other], `${baseName}-${other}.png`);

    if (active.imageUrl) URL.revokeObjectURL(active.imageUrl);
    updateCopy(id, {
      imageUrl: URL.createObjectURL(chosenFile),
      fileName: chosenFile.name,
      crops: null,
      splitMode: false,
    });

    const otherLabel = COPY_LABELS[copies.length] ?? `نسخة ${copies.length + 1}`;
    const otherCopy: Copy = {
      ...makeEmptyCopy(otherLabel, splitOrderKey(active.orderKey, copies.map((c) => c.orderKey))),
      fileName: otherFile.name,
      imageUrl: URL.createObjectURL(otherFile),
    };
    setCopies((prev) => [...prev, otherCopy]);
    reportCopy(otherCopy);

    await runTranscription(id, chosenFile);
    await runTranscription(otherCopy.id, otherFile);
  };

  const rotate = async () => {
    const id = active.id;
    if (!active.imageUrl) return;
    updateCopy(id, { error: null });
    try {
      const rotatedDataUrl = await rotateImage90(active.imageUrl);
      const file = await dataUrlToFile(
        rotatedDataUrl,
        `${(active.fileName ?? "page").replace(/\.[^.]+$/, "")}-rot.png`
      );
      const url = URL.createObjectURL(file);
      URL.revokeObjectURL(active.imageUrl);
      updateCopy(id, { imageUrl: url, fileName: file.name });
    } catch (err) {
      updateCopy(id, { error: err instanceof Error ? err.message : "تعذّر تدوير الصورة" });
    }
  };

  /** Explicit, user-triggered (re)transcription — a visible button
   * instead of relying only on the automatic OCR-on-upload. Rebuilds a
   * File from the copy's existing blob URL since we don't keep the
   * original File object around. */
  const retranscribe = async () => {
    if (!active.imageUrl) return;
    updateCopy(active.id, { error: null });
    try {
      const blob = await (await fetch(active.imageUrl)).blob();
      const file = new File([blob], active.fileName ?? "page.png", { type: blob.type || "image/png" });
      await runTranscription(active.id, file);
    } catch (err) {
      updateCopy(active.id, {
        error: err instanceof Error ? err.message : "تعذّر تجهيز الصورة لإعادة التفريغ",
      });
    }
  };

  const approve = () => {
    if (!active.transcript.trim()) return;
    updateCopy(active.id, { approved: true });
  };

  if (state === "hidden") return null;

  if (state === "collapsed") {
    return (
      <button
        onClick={onExpand}
        className="flex w-11 shrink-0 flex-col items-center justify-between rounded-xl border border-border bg-paper-dim py-4 text-ink-soft transition-colors hover:bg-bronze-light/30"
        title={`فتح لوح ${title}`}
      >
        <span className="text-xs">⤢</span>
        <span
          className="font-ui text-sm font-medium tracking-wide"
          style={{ writingMode: "vertical-rl" }}
        >
          {title}
        </span>
        <span className="text-xs opacity-60">{side === "right" ? "◂" : "▸"}</span>
      </button>
    );
  }

  return (
    <div
      className="flex shrink-0 flex-col rounded-xl border border-border bg-paper-dim/60 overflow-hidden"
      style={{ width }}
    >
      <div className="flex items-center justify-between border-b border-border bg-paper-dim px-3 py-2">
        <span className="font-ui text-sm font-semibold text-ink">{title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCollapse}
            className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-white/40"
            title="طي اللوح"
          >
            طي
          </button>
          <button
            onClick={onHide}
            className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-white/40"
            title="إخفاء اللوح تمامًا"
          >
            إخفاء
          </button>
        </div>
      </div>

      {/* Copy tabs — multiple copies live inside this one panel, ordered
          by orderKey so a split page's two halves appear in position */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-paper-dim/30 px-2 py-1">
        {[...copies].sort((a, b) => a.orderKey - b.orderKey).map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCopyId(c.id)}
            className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${
              c.id === activeCopyId
                ? "bg-bronze text-white"
                : c.approved
                ? "border border-green-600/40 text-green-700 hover:bg-white/60"
                : "text-ink-soft hover:bg-white/60"
            }`}
            title={`نسخة ${c.label}`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={addCopy}
          className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-bronze/60 px-2 py-0.5 text-xs text-bronze hover:bg-white/60"
          title="إضافة نسخة جديدة للمقابلة"
        >
          <span>＋</span>
          <span>نسخة جديدة</span>
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-b border-border bg-paper-dim/50 px-2 py-1">
        <label
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-white/60"
          title="استيراد صورة"
        >
          <Upload size={15} />
          <input
            type="file"
            accept=".pdf,.zip,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        <button
          onClick={() => updateCopy(active.id, { splitMode: !active.splitMode })}
          disabled={!active.imageUrl}
          title="قص الصورة إلى صفحتين"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-white/60 disabled:opacity-30"
        >
          <Scissors size={15} />
        </button>
        <button
          onClick={rotate}
          disabled={!active.imageUrl}
          title="تدوير 90°"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-white/60 disabled:opacity-30"
        >
          <RotateCw size={15} />
        </button>
        <button
          onClick={retranscribe}
          disabled={!active.imageUrl || active.busy}
          title="تفريغ النص من هذه الصورة"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-soft hover:bg-white/60 disabled:opacity-30"
        >
          <FileText size={14} />
          <span>{active.busy ? "جارٍ..." : "تفريغ"}</span>
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto p-3"
      >
        {active.fileName ? (
          <div className="flex h-full flex-col items-center gap-2 text-center text-sm text-ink-soft">
            {active.imageUrl && !active.splitMode && !active.crops && (
              <img
                src={active.imageUrl}
                alt={active.fileName}
                className="max-h-[40%] w-full rounded-md border border-border object-contain"
              />
            )}

            {active.imageUrl && active.splitMode && !active.crops && (
              <div className="w-full">
                <div ref={splitContainerRef} className="relative w-full select-none">
                  <img src={active.imageUrl} alt={active.fileName} className="w-full rounded-md border border-border" />
                  <div
                    onPointerDown={onSplitPointerDown}
                    onPointerMove={onSplitPointerMove}
                    onPointerUp={endSplitDrag}
                    onPointerCancel={endSplitDrag}
                    className="absolute top-0 h-full w-4 touch-none cursor-col-resize bg-bronze/80"
                    style={{ left: `calc(${active.splitX}% - 8px)` }}
                    title="اسحب لتحديد خط القص بين الوجهين"
                  />
                </div>
                <div className="mt-2 flex justify-center gap-2">
                  <button
                    onClick={runSplit}
                    className="rounded-md bg-bronze px-3 py-1 text-xs text-white hover:bg-bronze/90"
                  >
                    تنفيذ القص
                  </button>
                  <button
                    onClick={() => updateCopy(active.id, { splitMode: false })}
                    className="rounded-md border border-border px-3 py-1 text-xs text-ink-soft hover:bg-paper-dim"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {active.crops && (
              <div className="flex w-full gap-2">
                <div className="flex-1">
                  <img src={active.crops.right} alt="الوجه الأيمن" className="w-full rounded-md border border-border" />
                  <button
                    onClick={() => useCrop("right")}
                    className="mt-1 w-full rounded-md bg-bronze px-2 py-1 text-[11px] text-white hover:bg-bronze/90"
                  >
                    استخدام الوجه الأيمن
                  </button>
                </div>
                <div className="flex-1">
                  <img src={active.crops.left} alt="الوجه الأيسر" className="w-full rounded-md border border-border" />
                  <button
                    onClick={() => useCrop("left")}
                    className="mt-1 w-full rounded-md bg-bronze px-2 py-1 text-[11px] text-white hover:bg-bronze/90"
                  >
                    استخدام الوجه الأيسر
                  </button>
                </div>
              </div>
            )}

            <span className="text-xs">{active.fileName}</span>
            {active.busy && <span className="text-xs text-bronze">جارٍ التفريغ النصي…</span>}
            {active.error && <span className="text-xs text-red-700">{active.error}</span>}
          </div>
        ) : (
          <label className="flex h-full min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-ink-soft transition-colors hover:border-bronze hover:text-ink">
            <span className="text-2xl">＋</span>
            <span>استيراد كتاب كامل</span>
            <span className="text-xs opacity-70">PDF، ملف مضغوط، أو صورة صفحة</span>
            <input
              type="file"
              accept=".pdf,.zip,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        )}

        {/* The reviewable OCR draft — never auto-inserted into the main
            text. Editing it un-approves it; approving marks it ready for
            the merge tool to pick up. */}
        {active.fileName && (
          <div className="mt-2 rounded-lg border border-border bg-white/70 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                مسودة النص {active.approved && <span className="text-green-700">(معتمدة)</span>}
              </span>
              <button
                onClick={approve}
                disabled={!active.transcript.trim() || active.approved}
                className="rounded-full bg-bronze px-2 py-0.5 text-[10px] text-white hover:bg-bronze/90 disabled:opacity-40"
              >
                اعتماد
              </button>
            </div>
            <textarea
              dir="rtl"
              rows={3}
              value={active.transcript}
              onChange={(e) => updateCopy(active.id, { transcript: e.target.value, approved: false })}
              placeholder="سيظهر النص المفرَّغ هنا للمراجعة…"
              className="w-full resize-y rounded-md border border-border bg-white/80 p-1.5 text-xs leading-relaxed text-ink outline-none placeholder:text-ink-soft/50"
            />
          </div>
        )}

        <div className="mt-2 space-y-2">
          {IMAGE_NOTE_CATEGORIES.map((cat) => {
            const catNotes = active.notes.filter((n) => n.category === cat.key);
            return (
              <div key={cat.key} className="rounded-lg border border-border bg-white/70 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">{cat.label}</span>
                  <button
                    onClick={() => addNote(cat.key)}
                    className="rounded-full border border-border bg-white/60 px-2 py-0.5 text-[10px] text-bronze hover:bg-white"
                  >
                    ＋ إضافة
                  </button>
                </div>
                {catNotes.length > 0 && (
                  <div className="divide-y divide-border/50">
                    {catNotes.map((n) => (
                      <div key={n.id} className="flex items-start gap-2 py-1.5 first:pt-0 last:pb-0">
                        <span className="mt-2 shrink-0 text-[11px] font-semibold text-ink-soft">
                          {n.index}.
                        </span>
                        <textarea
                          dir="rtl"
                          rows={2}
                          value={n.text}
                          onChange={(e) => updateNoteText(n.id, e.target.value)}
                          placeholder={`اكتب ${cat.label} هنا…`}
                          className="min-w-0 flex-1 resize-y rounded-md border border-border bg-white/80 p-1.5 text-xs leading-relaxed text-ink outline-none placeholder:text-ink-soft/50"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
