import { useCallback, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { FootnoteMark } from "./lib/footnoteExtension";
import {
  Bold,
  Italic,
  Underline,
  AlignRight,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  List,
  ListOrdered,
  Heading2,
  Pilcrow,
  Eraser,
  MoreHorizontal,
  Upload,
  Scissors,
  RotateCw,
} from "lucide-react";
import { transcribeImage, assistText } from "./lib/supabaseClient";

type SyncMode = "independent" | "manuscript" | "printed";
type PanelSide = "right" | "left";
type PanelState = "expanded" | "collapsed" | "hidden";

const MIN_CENTER_WIDTH = 360;
const DEFAULT_SIDE_WIDTH = 340;
const MIN_SIDE_WIDTH = 220;
const MAX_SIDE_WIDTH = 640;

const SPECIAL_CHARS = ["﴿", "﴾", "«", "»", "[", "]", "(", ")", "…"];

const FOOTNOTE_CATEGORIES = [
  { key: "takhrij", label: "التخريج والعزو" },
  { key: "furuq", label: "فروق النسخ" },
  { key: "gharib", label: "شرح الغريب" },
  { key: "tahqiq", label: "تعليقات المحقق" },
] as const;

type FootnoteCategoryKey = (typeof FOOTNOTE_CATEGORIES)[number]["key"];

type FootnoteEntry = {
  id: string;
  category: FootnoteCategoryKey;
  index: number;
  text: string;
  includeInPrint: boolean;
};

const IMAGE_NOTE_CATEGORIES = [
  { key: "desc", label: "توصيف" },
  { key: "comment", label: "تعليق" },
] as const;

type ImageNoteCategoryKey = (typeof IMAGE_NOTE_CATEGORIES)[number]["key"];

type ImageNoteEntry = {
  id: string;
  category: ImageNoteCategoryKey;
  index: number;
  text: string;
};

const ASSIST_ACTIONS = [
  { key: "tashkeel", label: "تشكيل" },
  { key: "tasheeh", label: "تصحيح" },
  { key: "hamzat", label: "توحيد الهمزات" },
  { key: "tarqeem", label: "ترقيم" },
  { key: "faharis", label: "فهارس" },
] as const;

/** Crops a double-page-spread image into its right and left halves at
 * `splitPercent` (0-100, measured from the visual left edge), following
 * the same manual-split-line approach used by book-scan tools like
 * ScanTailor. Returns two PNG data URLs. */
function cropImageHalves(
  imageUrl: string,
  splitPercent: number
): Promise<{ left: string; right: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const splitX = Math.round((img.naturalWidth * splitPercent) / 100);
      const makeCrop = (sx: number, sw: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, sw);
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("تعذّر إنشاء لوحة الرسم لقص الصورة");
        ctx.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, sw, img.naturalHeight);
        return canvas.toDataURL("image/png");
      };
      try {
        resolve({
          left: makeCrop(0, splitX),
          right: makeCrop(splitX, img.naturalWidth - splitX),
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة للقص"));
    img.src = imageUrl;
  });
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

type DiffOp = { type: "equal" | "add" | "remove"; text: string };

/** Standard word-level LCS diff. Splits on whitespace (keeping the
 * whitespace tokens so spacing is preserved), builds the LCS table, then
 * backtracks to produce a sequence of equal/add/remove operations. */
function diffWords(a: string, b: string): DiffOp[] {
  const aw = a.split(/(\s+)/).filter((t) => t.length > 0);
  const bw = b.split(/(\s+)/).filter((t) => t.length > 0);
  const n = aw.length;
  const m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) {
      ops.push({ type: "equal", text: aw[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: aw[i] });
      i++;
    } else {
      ops.push({ type: "add", text: bw[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", text: aw[i++] });
  while (j < m) ops.push({ type: "add", text: bw[j++] });
  return ops;
}

/** Groups raw diff ops into runs, merging consecutive add/remove ops into
 * one chunk (so a replaced phrase becomes a single "convert to footnote"
 * unit instead of one button per word). */
function groupDiffOps(ops: DiffOp[]): { equal?: string; removed?: string; added?: string }[] {
  const groups: { equal?: string; removed?: string; added?: string }[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "equal") {
      let text = "";
      while (i < ops.length && ops[i].type === "equal") text += ops[i++].text;
      groups.push({ equal: text });
    } else {
      let removed = "";
      let added = "";
      while (i < ops.length && ops[i].type !== "equal") {
        if (ops[i].type === "remove") removed += ops[i].text;
        else added += ops[i].text;
        i++;
      }
      groups.push({ removed: removed.trim(), added: added.trim() });
    }
  }
  return groups;
}

/** Rotates an image 90° clockwise using canvas. Returns a PNG data URL. */
function rotateImage90(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("تعذّر إنشاء لوحة الرسم للتدوير"));
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة للتدوير"));
    img.src = imageUrl;
  });
}

/** One manuscript/printed copy within a side panel: its own image, OCR
 * status, split-tool state, and description/comment notes. Multiple
 * copies live inside the SAME panel as tabs — this is not multiple
 * panels, per the corrected design (comparison across copies is logical,
 * via tagged variant footnotes, not a side-by-side visual layout). */
type Copy = {
  id: string;
  label: string;
  fileName: string | null;
  imageUrl: string | null;
  busy: boolean;
  error: string | null;
  /** This copy's own OCR'd text, kept separately from whatever ends up
   * in the main editor — needed so two copies can be diffed against each
   * other for the "فروق النسخ" comparison tool. */
  transcript: string;
  notes: ImageNoteEntry[];
  splitMode: boolean;
  splitX: number;
  crops: { left: string; right: string } | null;
};

const COPY_LABELS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"];

function makeEmptyCopy(label: string): Copy {
  return {
    id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    fileName: null,
    imageUrl: null,
    busy: false,
    error: null,
    transcript: "",
    notes: [],
    splitMode: false,
    splitX: 50,
    crops: null,
  };
}

/** A side panel (manuscript image or printed image). Collapses to a closed
 * vertical strip and can be hidden entirely. Never affects the center panel's
 * guaranteed minimum width. Holds one or more named copies (أ، ب، ج…) as
 * tabs within itself — every copy is OCR'd automatically via the AI
 * `transcribe` function as soon as it's added. */
function SidePanel({
  side,
  title,
  state,
  width,
  onExpand,
  onCollapse,
  onHide,
  scrollRef,
  onScroll,
  onTextRecognized,
  onTranscriptReady,
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
  onTextRecognized: (text: string) => void;
  onTranscriptReady: (copyId: string, label: string, text: string) => void;
}) {
  const [copies, setCopies] = useState<Copy[]>([
    { id: "copy-1", label: COPY_LABELS[0], fileName: null, imageUrl: null, busy: false, error: null, transcript: "", notes: [], splitMode: false, splitX: 50, crops: null },
  ]);
  const [activeCopyId, setActiveCopyId] = useState("copy-1");
  const active = copies.find((c) => c.id === activeCopyId) ?? copies[0];

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

  const updateCopy = (id: string, patch: Partial<Copy>) => {
    setCopies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addCopy = () => {
    const nextLabel = COPY_LABELS[copies.length] ?? `نسخة ${copies.length + 1}`;
    const newCopy = makeEmptyCopy(nextLabel);
    setCopies((prev) => [...prev, newCopy]);
    setActiveCopyId(newCopy.id);
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

  const runTranscription = async (id: string, label: string, file: File) => {
    updateCopy(id, { busy: true, error: null });
    try {
      const recognized = await transcribeImage(file);
      updateCopy(id, { transcript: recognized });
      onTranscriptReady(id, label, recognized);
      onTextRecognized(recognized);
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
    await runTranscription(id, active.label, file);
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

  /** Applies one crop as this copy's image. The OTHER half is never
   * discarded — it becomes a new copy tab automatically, so splitting a
   * spread always keeps both pages available. */
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
      ...makeEmptyCopy(otherLabel),
      fileName: otherFile.name,
      imageUrl: URL.createObjectURL(otherFile),
    };
    setCopies((prev) => [...prev, otherCopy]);

    await runTranscription(id, active.label, chosenFile);
    await runTranscription(otherCopy.id, otherLabel, otherFile);
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

      {/* Copy tabs — multiple copies live inside this one panel */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-paper-dim/30 px-2 py-1">
        {copies.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCopyId(c.id)}
            className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${
              c.id === activeCopyId
                ? "bg-bronze text-white"
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
                className="max-h-[50%] w-full rounded-md border border-border object-contain"
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
          <label className="flex h-full min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-ink-soft transition-colors hover:border-bronze hover:text-ink">
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


/** Formatting toolbar for the main editor — the full set of common
 * actions shown directly in one row (only "remove formatting", a rare
 * action, is tucked behind "…"), per the standard toolbar convention:
 * fold only what's genuinely rare, not most of the bar. Calls real
 * TipTap (ProseMirror) commands directly on the editor instance. */
function FormatToolbar({ editor }: { editor: Editor | null }) {
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

/** Insert-symbol button for classical Arabic editing marks — one button
 * opening a small grid, instead of every mark shown inline all the time. */
function SpecialCharsToolbar({ onInsert }: { onInsert: (ch: string) => void }) {
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

/** The four fixed footnote categories, with insert buttons and an editable
 * list of every footnote entered so far. Each entry has a checkbox that
 * controls whether it's included ("مُثبَتة") when the document is printed —
 * unchecking it never deletes the marker from the text, only excludes it
 * from print output. */
function FootnotesPanel({
  entries,
  onInsert,
  onChangeText,
  onToggleInclude,
}: {
  entries: FootnoteEntry[];
  onInsert: (categoryKey: FootnoteCategoryKey) => void;
  onChangeText: (id: string, text: string) => void;
  onToggleInclude: (id: string) => void;
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
                        placeholder="اكتب نص الحاشية هنا…"
                        className="min-w-0 flex-1 resize-y rounded-md border border-border bg-white/80 p-2 font-naskh text-base leading-relaxed text-ink outline-none placeholder:text-ink-soft/50"
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

/** Five quick AI actions on the whole manuscript text. Results are shown
 * for review — nothing overwrites the text panel until the user applies it. */
function AssistToolbar({
  getText,
  onApply,
}: {
  getText: () => string;
  onApply: (newText: string) => void;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [result, setResult] = useState<{ action: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: (typeof ASSIST_ACTIONS)[number]) => {
    const text = getText();
    if (!text.trim()) return;
    setBusyAction(action.key);
    setError(null);
    setResult(null);
    try {
      const resultText = await assistText(text, action.key);
      setResult({ action: action.label, text: resultText });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="border-t border-border bg-paper-dim/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink-soft">مساعد المحقق:</span>
        {ASSIST_ACTIONS.map((action) => (
          <button
            key={action.key}
            onClick={() => run(action)}
            disabled={busyAction !== null}
            className="rounded-md border border-border bg-white/60 px-3 py-1 text-xs text-ink hover:bg-white disabled:opacity-50"
          >
            {busyAction === action.key ? "جارٍ التنفيذ…" : action.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {result && (
        <div className="mt-2 rounded-lg border border-border bg-white/70 p-3">
          <p className="mb-1 text-xs font-semibold text-ink-soft">
            نتيجة "{result.action}" — راجعها قبل التطبيق:
          </p>
          <p dir="rtl" className="max-h-32 overflow-auto whitespace-pre-wrap font-naskh text-sm text-ink">
            {result.text}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                onApply(result.text);
                setResult(null);
              }}
              className="rounded-md bg-bronze px-3 py-1 text-xs text-white hover:bg-bronze/90"
            >
              تطبيق على النص
            </button>
            <button
              onClick={() => setResult(null)}
              className="rounded-md border border-border px-3 py-1 text-xs text-ink-soft hover:bg-paper-dim"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The actual core "فروق النسخ" (variant-copy collation) tool: pick any
 * two OCR'd copies (from either the manuscript or printed panel), see a
 * word-level diff between them, and turn each difference into a tagged
 * "فروق النسخ" footnote with one tap — the specific, named-copy variant
 * apparatus that real tahqiq methodology requires, not a generic
 * "compare tool". */
function CompareCopiesPanel({
  transcripts,
  onInsertFootnote,
}: {
  transcripts: { id: string; side: "manuscript" | "printed"; label: string; text: string }[];
  onInsertFootnote: (categoryKey: FootnoteCategoryKey, presetText: string) => void;
}) {
  const [keyA, setKeyA] = useState("");
  const [keyB, setKeyB] = useState("");

  const sideLabel = (s: "manuscript" | "printed") => (s === "manuscript" ? "المخطوط" : "المطبوعة");
  const optionLabel = (t: (typeof transcripts)[number]) => `${sideLabel(t.side)} – ${t.label}`;
  const compositeKey = (t: { side: string; id: string }) => `${t.side}-${t.id}`;

  const a = transcripts.find((t) => compositeKey(t) === keyA);
  const b = transcripts.find((t) => compositeKey(t) === keyB);

  const groups = useMemo(() => {
    if (!a || !b) return null;
    return groupDiffOps(diffWords(a.text, b.text));
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
          {transcripts.map((t) => (
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
          {transcripts.map((t) => (
            <option key={compositeKey(t)} value={compositeKey(t)}>
              {optionLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {transcripts.length === 0 && (
        <p className="text-xs text-ink-soft">
          استورد صورًا في لوح المخطوط أو المطبوعة أولًا حتى تُفرّغ نصيًا وتظهر هنا للمقابلة.
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

/** Drag handle between the center text panel and a side panel. Only ever
 * resizes the side panel's width, so the center panel's minimum is never
 * violated. Uses Pointer Events (not mouse-only events) with pointer
 * capture, so dragging works on touch/mobile as well as with a mouse —
 * plain mousemove/mouseup listeners never fire on touch input at all. */
function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
    onDrag(delta);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    document.body.style.cursor = "";
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group flex w-4 shrink-0 touch-none cursor-col-resize items-center justify-center"
    >
      <div className="h-16 w-1 rounded-full bg-border transition-colors group-hover:bg-bronze" />
    </div>
  );
}

export default function App() {
  const [manuscriptState, setManuscriptState] = useState<PanelState>("expanded");
  const [printedState, setPrintedState] = useState<PanelState>("expanded");
  const [manuscriptWidth, setManuscriptWidth] = useState(DEFAULT_SIDE_WIDTH);
  const [printedWidth, setPrintedWidth] = useState(DEFAULT_SIDE_WIDTH);
  const [syncMode, setSyncMode] = useState<SyncMode>("independent");
  const [footnotes, setFootnotes] = useState<FootnoteEntry[]>([]);

  /** Every copy's OCR'd text from both side panels, gathered here so the
   * comparison tool (which lives in the center text panel) can diff any
   * two copies against each other, from either panel. */
  const [copyTranscripts, setCopyTranscripts] = useState<
    { id: string; side: "manuscript" | "printed"; label: string; text: string }[]
  >([]);
  const registerTranscript = useCallback(
    (side: "manuscript" | "printed") => (copyId: string, label: string, text: string) => {
      setCopyTranscripts((prev) => {
        const others = prev.filter((t) => !(t.id === copyId && t.side === side));
        return [...others, { id: copyId, side, label, text }];
      });
    },
    []
  );

  const manuscriptScrollRef = useRef<HTMLDivElement>(null);
  const printedScrollRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2] } }),
      UnderlineExt,
      TextAlign.configure({ types: ["paragraph", "heading"] }),
      FootnoteMark,
    ],
    content: "",
    editorProps: {
      attributes: {
        dir: "rtl",
        class:
          "h-full min-h-full whitespace-pre-wrap bg-transparent p-5 font-naskh text-lg leading-loose text-ink outline-none",
      },
    },
  });

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

  // RTL layout: manuscript sits on the visual right, printed text on the
  // visual left, center panel between them. Dragging toward the center
  // shrinks the side panel; dragging away grows it.
  const handleManuscriptDrag = useCallback((deltaX: number) => {
    setManuscriptWidth((w) => clamp(w - deltaX, MIN_SIDE_WIDTH, MAX_SIDE_WIDTH));
  }, []);
  const handlePrintedDrag = useCallback((deltaX: number) => {
    setPrintedWidth((w) => clamp(w + deltaX, MIN_SIDE_WIDTH, MAX_SIDE_WIDTH));
  }, []);

  const syncFromPanel = (source: "manuscript" | "printed") => {
    if (syncMode !== source) return;
    const src =
      source === "manuscript" ? manuscriptScrollRef.current : printedScrollRef.current;
    const dst = editorWrapperRef.current;
    if (!src || !dst) return;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    dst.scrollTop = ratio * Math.max(1, dst.scrollHeight - dst.clientHeight);
  };

  /** Inserts plain text (special characters) at the current cursor
   * position via TipTap's own command — the document model handles caret
   * placement correctly on its own, no manual Range code needed. */
  const insertAtCursor = useCallback((insertText: string) => {
    editor?.chain().focus().insertContent(insertText).run();
  }, [editor]);

  /** Inserts an atomic footnoteMarker node at the caret. Being a real
   * ProseMirror node (not a DOM element spliced in via Range hacks), it
   * moves correctly with surrounding text through normal edits. */
  const insertFootnote = useCallback((categoryKey: FootnoteCategoryKey, presetText = "") => {
    if (!editor) return;
    const nextIndex = footnotes.filter((f) => f.category === categoryKey).length + 1;
    const id = `fn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    editor
      .chain()
      .focus()
      .insertContent({ type: "footnoteMarker", attrs: { footnoteId: id, number: nextIndex } })
      .run();

    setFootnotes((prev) => [
      ...prev,
      { id, category: categoryKey, index: nextIndex, text: presetText, includeInPrint: true },
    ]);
  }, [editor, footnotes]);

  const updateFootnoteText = useCallback((id: string, text: string) => {
    setFootnotes((prev) => prev.map((f) => (f.id === id ? { ...f, text } : f)));
  }, []);

  const toggleFootnoteInclude = useCallback((id: string) => {
    setFootnotes((prev) =>
      prev.map((f) => (f.id === id ? { ...f, includeInPrint: !f.includeInPrint } : f))
    );
  }, []);

  /** Appends OCR text from a newly added manuscript/printed copy at the
   * end of the document, separated by a couple of line breaks if the
   * document already has content. */
  const appendRecognizedText = useCallback((recognized: string) => {
    if (!recognized.trim() || !editor) return;
    const chain = editor.chain().focus("end");
    if (!editor.isEmpty) chain.setHardBreak().setHardBreak();
    chain.insertContent(recognized).run();
  }, [editor]);

  /** Full-text AI actions replace the whole document with plain
   * paragraphs (footnote marker nodes are not preserved through this
   * operation yet — the AI only ever sees/returns plain text). */
  const replaceAllText = useCallback((newText: string) => {
    if (!editor) return;
    const paragraphs = newText
      .split(/\n+/)
      .filter((line) => line.length > 0)
      .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }));
    editor.commands.setContent(paragraphs.length ? paragraphs : "<p></p>");
  }, [editor]);

  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printBodyText, setPrintBodyText] = useState("");
  const [printFootnoteList, setPrintFootnoteList] = useState<
    { number: number; category: string; text: string }[]
  >([]);

  /** Builds the print view: footnotes excluded via their checkbox are
   * removed from the text entirely. If the included footnotes span more
   * than one category, they're renumbered sequentially (1, 2, 3…) in the
   * order they appear in the text, merging all categories together. If
   * only one category is included, its own per-category numbering is kept
   * as-is. */
  const buildPrintPreview = useCallback(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement;

    const clone = el.cloneNode(true) as HTMLElement;
    const markerEls = Array.from(
      clone.querySelectorAll<HTMLElement>("sup[data-footnote-id]")
    );
    const orderedIds = markerEls.map((m) => m.dataset.footnoteId!);

    const includedEntries = footnotes.filter((f) => f.includeInPrint);
    const includedIds = new Set(includedEntries.map((f) => f.id));
    const unify = new Set(includedEntries.map((f) => f.category)).size > 1;

    let counter = 0;
    const numberById = new Map<string, number>();
    for (const id of orderedIds) {
      if (!includedIds.has(id)) continue;
      counter += 1;
      numberById.set(id, counter);
    }

    markerEls.forEach((m) => {
      const id = m.dataset.footnoteId!;
      if (!includedIds.has(id)) {
        m.remove();
        return;
      }
      const entry = footnotes.find((f) => f.id === id)!;
      m.textContent = String(unify ? numberById.get(id) : entry.index);
    });

    setPrintBodyText(clone.innerText);
    setPrintFootnoteList(
      orderedIds
        .filter((id) => includedIds.has(id))
        .map((id) => {
          const entry = footnotes.find((f) => f.id === id)!;
          const label = FOOTNOTE_CATEGORIES.find((c) => c.key === entry.category)!.label;
          return {
            number: unify ? numberById.get(id)! : entry.index,
            category: label,
            text: entry.text,
          };
        })
    );
    setShowPrintPreview(true);
  }, [footnotes, editor]);

  return (
    <div className="flex h-screen flex-col bg-paper font-ui">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-paper px-5 py-3">
        <h1 className="font-naskh text-xl font-bold text-ink">مساعد المحقق الذكي</h1>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <span>تزامن التمرير:</span>
            <select
              value={syncMode}
              onChange={(e) => setSyncMode(e.target.value as SyncMode)}
              className="rounded-md border border-border bg-white/60 px-2 py-1 text-sm text-ink"
            >
              <option value="independent">مستقل</option>
              <option value="manuscript">مرتبط بصورة المخطوط</option>
              <option value="printed">مرتبط بصورة المطبوعة</option>
            </select>
          </label>

          <button
            onClick={buildPrintPreview}
            className="rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
          >
            معاينة الطباعة
          </button>

          {manuscriptState === "hidden" && (
            <button
              onClick={() => setManuscriptState("expanded")}
              className="rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
            >
              إظهار المخطوط
            </button>
          )}
          {printedState === "hidden" && (
            <button
              onClick={() => setPrintedState("expanded")}
              className="rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
            >
              إظهار المطبوعة
            </button>
          )}
        </div>
      </header>

      {/* Workspace: manuscript (right) — text (center, always present) — printed (left) */}
      <main className="flex flex-1 gap-2 overflow-hidden p-3">
        <SidePanel
          side="right"
          title="المخطوط"
          state={manuscriptState}
          width={manuscriptWidth}
          onExpand={() => setManuscriptState("expanded")}
          onCollapse={() => setManuscriptState("collapsed")}
          onHide={() => setManuscriptState("hidden")}
          scrollRef={manuscriptScrollRef}
          onScroll={() => syncFromPanel("manuscript")}
          onTextRecognized={appendRecognizedText}
          onTranscriptReady={registerTranscript("manuscript")}
        />

        {manuscriptState === "expanded" && (
          <ResizeHandle onDrag={handleManuscriptDrag} />
        )}

        {/* Center text panel — the primary panel. Always rendered, never
            hidden; only its width changes via the side drag handles. */}
        <div
          className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-white/50"
          style={{ minWidth: MIN_CENTER_WIDTH }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-ui text-sm font-semibold text-ink">
              نص التحقيق
            </span>
            <span className="text-xs text-ink-soft">
              الكلمات: {editor && editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0} — الحروف: {editor?.getText().length ?? 0}
            </span>
          </div>
          <FormatToolbar editor={editor} />
          <SpecialCharsToolbar onInsert={insertAtCursor} />
          <div
            ref={editorWrapperRef}
            className="relative flex-1 overflow-auto"
            onClick={(e) => {
              const marker = (e.target as HTMLElement).closest("sup[data-footnote-id]");
              const id = marker?.getAttribute("data-footnote-id");
              if (!id) return;
              const input = document.getElementById(`footnote-input-${id}`) as HTMLTextAreaElement | null;
              input?.scrollIntoView({ block: "nearest" });
              input?.focus();
            }}
          >
            {editor?.isEmpty && (
              <span className="pointer-events-none absolute right-5 top-5 font-naskh text-lg text-ink-soft/60">
                ابدأ كتابة نص التحقيق هنا…
              </span>
            )}
            <EditorContent editor={editor} />
          </div>
          <CompareCopiesPanel transcripts={copyTranscripts} onInsertFootnote={insertFootnote} />
          <FootnotesPanel
            entries={footnotes}
            onInsert={insertFootnote}
            onChangeText={updateFootnoteText}
            onToggleInclude={toggleFootnoteInclude}
          />
          <AssistToolbar
            getText={() => editor?.getText() ?? ""}
            onApply={replaceAllText}
          />
        </div>

        {printedState === "expanded" && (
          <ResizeHandle onDrag={handlePrintedDrag} />
        )}

        <SidePanel
          side="left"
          title="المطبوعة"
          state={printedState}
          width={printedWidth}
          onExpand={() => setPrintedState("expanded")}
          onCollapse={() => setPrintedState("collapsed")}
          onHide={() => setPrintedState("hidden")}
          scrollRef={printedScrollRef}
          onScroll={() => syncFromPanel("printed")}
          onTextRecognized={appendRecognizedText}
          onTranscriptReady={registerTranscript("printed")}
        />
      </main>

      {showPrintPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            dir="rtl"
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-paper p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-naskh text-lg font-bold text-ink">معاينة الطباعة</h2>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
              >
                إغلاق
              </button>
            </div>

            <p className="whitespace-pre-wrap font-naskh text-lg leading-loose text-ink">
              {printBodyText || "لا يوجد نص بعد"}
            </p>

            {printFootnoteList.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-bold text-ink">الحواشي</h3>
                <ol className="space-y-1 text-sm text-ink">
                  {printFootnoteList.map((f, i) => (
                    <li key={i}>
                      ({f.number}) {f.text || "—"}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
