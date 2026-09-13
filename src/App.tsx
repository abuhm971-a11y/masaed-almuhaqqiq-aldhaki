import { useCallback, useRef, useState } from "react";
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

/** A side panel (manuscript image or printed image). Collapses to a closed
 * vertical strip and can be hidden entirely. Never affects the center panel's
 * guaranteed minimum width. */
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
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitX, setSplitX] = useState(50);
  const [crops, setCrops] = useState<{ left: string; right: string } | null>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

  const runTranscription = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const recognized = await transcribeImage(file);
      onTextRecognized(recognized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تفريغ النص من الصورة");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setCrops(null);
    setSplitMode(false);

    if (!file.type.startsWith("image/")) {
      setImageUrl(null);
      // PDF/ZIP splitting into pages isn't built yet — see README.
      return;
    }

    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

    await runTranscription(file);
  };

  const onSplitDragStart = () => {
    draggingSplit.current = true;
    document.body.style.cursor = "col-resize";

    const onMove = (ev: MouseEvent) => {
      if (!draggingSplit.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitX(Math.min(95, Math.max(5, pct)));
    };
    const onUp = () => {
      draggingSplit.current = false;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const runSplit = async () => {
    if (!imageUrl) return;
    setError(null);
    try {
      setCrops(await cropImageHalves(imageUrl, splitX));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تقطيع الصورة");
    }
  };

  const useCrop = async (which: "left" | "right") => {
    if (!crops) return;
    const file = await dataUrlToFile(
      crops[which],
      `${(fileName ?? "page").replace(/\.[^.]+$/, "")}-${which}.png`
    );
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileName(file.name);
    setCrops(null);
    setSplitMode(false);
    await runTranscription(file);
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto p-3"
      >
        {fileName ? (
          <div className="flex h-full flex-col items-center gap-2 text-center text-sm text-ink-soft">
            {imageUrl && !splitMode && !crops && (
              <img
                src={imageUrl}
                alt={fileName}
                className="max-h-[50%] w-full rounded-md border border-border object-contain"
              />
            )}

            {imageUrl && splitMode && !crops && (
              <div className="w-full">
                <div ref={splitContainerRef} className="relative w-full select-none">
                  <img src={imageUrl} alt={fileName} className="w-full rounded-md border border-border" />
                  <div
                    onMouseDown={onSplitDragStart}
                    className="absolute top-0 h-full w-1.5 cursor-col-resize bg-bronze"
                    style={{ left: `${splitX}%` }}
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
                    onClick={() => setSplitMode(false)}
                    className="rounded-md border border-border px-3 py-1 text-xs text-ink-soft hover:bg-paper-dim"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {crops && (
              <div className="flex w-full gap-2">
                <div className="flex-1">
                  <img src={crops.right} alt="الوجه الأيمن" className="w-full rounded-md border border-border" />
                  <button
                    onClick={() => useCrop("right")}
                    className="mt-1 w-full rounded-md bg-bronze px-2 py-1 text-[11px] text-white hover:bg-bronze/90"
                  >
                    استخدام الوجه الأيمن
                  </button>
                </div>
                <div className="flex-1">
                  <img src={crops.left} alt="الوجه الأيسر" className="w-full rounded-md border border-border" />
                  <button
                    onClick={() => useCrop("left")}
                    className="mt-1 w-full rounded-md bg-bronze px-2 py-1 text-[11px] text-white hover:bg-bronze/90"
                  >
                    استخدام الوجه الأيسر
                  </button>
                </div>
              </div>
            )}

            <span className="text-xs">{fileName}</span>
            {busy && <span className="text-xs text-bronze">جارٍ التفريغ النصي…</span>}
            {error && <span className="text-xs text-red-700">{error}</span>}

            {imageUrl && !splitMode && !crops && (
              <button
                onClick={() => setSplitMode(true)}
                className="text-xs text-bronze underline"
              >
                قص الصورة إلى صفحتين
              </button>
            )}

            <label className="cursor-pointer text-xs text-bronze underline">
              استيراد صورة أخرى
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

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          dir="rtl"
          placeholder="وصف أو تعليق على هذه الصورة…"
          rows={2}
          className="mt-2 w-full rounded-md border border-border bg-white/50 p-2 text-xs text-ink outline-none placeholder:text-ink-soft/50"
        />
      </div>
    </div>
  );
}

/** Quick-insert toolbar for classical Arabic editing marks. */
function SpecialCharsToolbar({ onInsert }: { onInsert: (ch: string) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border bg-paper-dim/40 px-3 py-1.5">
      {SPECIAL_CHARS.map((ch) => (
        <button
          key={ch}
          onClick={() => onInsert(ch)}
          className="min-w-[28px] rounded-md px-1.5 py-0.5 font-naskh text-base text-ink hover:bg-white/60"
          title={`إدراج ${ch}`}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

/** The four fixed footnote categories, with insert buttons and an editable
 * list of every footnote entered so far, grouped under one heading per
 * category so repeated inserts of the same type stack together (1, 2, 3…)
 * instead of appearing as separate unrelated boxes. Each entry has a
 * checkbox that controls whether it's included ("مُثبَتة") when the
 * document is printed — unchecking it never deletes the marker from the
 * text, only excludes it from print output. */
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
            <div key={cat.key} className="mb-3 last:mb-0">
              <div className="mb-1 text-xs font-bold text-ink">{cat.label}</div>
              <div className="space-y-2">
                {entries
                  .filter((e) => e.category === cat.key)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className={`rounded-lg border border-border bg-white/70 p-2 ${
                        entry.includeInPrint ? "" : "opacity-50"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink-soft">
                          #{entry.index}
                        </span>
                        <label className="flex items-center gap-1 text-[11px] text-ink-soft">
                          <span>إثبات في الطباعة</span>
                          <input
                            type="checkbox"
                            checked={entry.includeInPrint}
                            onChange={() => onToggleInclude(entry.id)}
                            title="إثبات هذه الحاشية عند الطباعة"
                            className="h-3.5 w-3.5 accent-bronze"
                          />
                        </label>
                      </div>
                      <textarea
                        id={`footnote-input-${entry.id}`}
                        dir="rtl"
                        rows={2}
                        value={entry.text}
                        onChange={(e) => onChangeText(entry.id, e.target.value)}
                        placeholder="اكتب نص الحاشية هنا…"
                        className="w-full resize-y rounded-md border border-border bg-white/80 p-2 font-naskh text-base leading-relaxed text-ink outline-none placeholder:text-ink-soft/50"
                      />
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

/** Drag handle between the center text panel and a side panel. Only ever
 * resizes the side panel's width, so the center panel's minimum is never
 * violated. */
function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = "col-resize";

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onDrag(delta);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      className="group flex w-3 shrink-0 cursor-col-resize items-center justify-center"
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

  const manuscriptScrollRef = useRef<HTMLDivElement>(null);
  const printedScrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

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

  const recomputeCounts = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const plain = el.innerText.replace(/\u00a0/g, " ");
    setIsEmpty(el.innerText.trim().length === 0);
    setCounts({
      chars: plain.length,
      words: plain.trim() ? plain.trim().split(/\s+/).length : 0,
    });
  }, []);

  const syncFromPanel = (source: "manuscript" | "printed") => {
    if (syncMode !== source) return;
    const src =
      source === "manuscript" ? manuscriptScrollRef.current : printedScrollRef.current;
    const dst = editorRef.current;
    if (!src || !dst) return;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    dst.scrollTop = ratio * Math.max(1, dst.scrollHeight - dst.clientHeight);
  };

  /** Places the caret at the very end of the editor. Used when there is no
   * live text selection to insert at (e.g. after importing an image). */
  const placeCaretAtEnd = (el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  /** Inserts a plain-text node at the current caret position inside the
   * editor (falls back to the end if the editor isn't focused/selected). */
  const insertAtCursor = useCallback((insertText: string) => {
    const el = editorRef.current;
    if (!el) return;

    const sel = window.getSelection();
    const selectionInsideEditor =
      sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!selectionInsideEditor) {
      el.focus();
      placeCaretAtEnd(el);
    }

    const range = window.getSelection()!.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(insertText);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    recomputeCounts();
  }, [recomputeCounts]);

  /** Inserts a non-editable superscript footnote marker token at the
   * caret, followed by a zero-width space so typing can continue after it. */
  const insertFootnote = useCallback((categoryKey: FootnoteCategoryKey) => {
    const el = editorRef.current;
    if (!el) return;

    const nextIndex = footnotes.filter((f) => f.category === categoryKey).length + 1;
    const label = FOOTNOTE_CATEGORIES.find((c) => c.key === categoryKey)!.label;
    const id = `fn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const sel = window.getSelection();
    const selectionInsideEditor =
      sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!selectionInsideEditor) {
      el.focus();
      placeCaretAtEnd(el);
    }

    const marker = document.createElement("sup");
    marker.contentEditable = "false";
    marker.dataset.footnoteId = id;
    marker.title = `${label} #${nextIndex} — انقر لتحرير نصها`;
    marker.className =
      "mx-0.5 cursor-pointer rounded bg-bronze-light/60 px-1 text-[11px] font-ui text-ink hover:bg-bronze-light";
    marker.textContent = String(nextIndex);
    marker.addEventListener("click", () => {
      const input = document.getElementById(`footnote-input-${id}`) as HTMLTextAreaElement | null;
      input?.scrollIntoView({ block: "nearest" });
      input?.focus();
    });

    const spacer = document.createTextNode("\u200b");

    const range = window.getSelection()!.getRangeAt(0);
    range.deleteContents();
    // Insert both nodes atomically, in order, so a second insertNode call
    // can't re-collapse the range and reverse their order.
    const frag = document.createDocumentFragment();
    frag.appendChild(marker);
    frag.appendChild(spacer);
    range.insertNode(frag);
    // Position the caret using the actual spacer node reference — safe
    // regardless of how the range's own boundary was left after insertNode.
    range.setStartAfter(spacer);
    range.setEndAfter(spacer);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    recomputeCounts();
    setFootnotes((prev) => [
      ...prev,
      { id, category: categoryKey, index: nextIndex, text: "", includeInPrint: true },
    ]);
  }, [footnotes, recomputeCounts]);

  const updateFootnoteText = useCallback((id: string, text: string) => {
    setFootnotes((prev) => prev.map((f) => (f.id === id ? { ...f, text } : f)));
  }, []);

  const toggleFootnoteInclude = useCallback((id: string) => {
    setFootnotes((prev) =>
      prev.map((f) => (f.id === id ? { ...f, includeInPrint: !f.includeInPrint } : f))
    );
  }, []);

  const appendRecognizedText = useCallback((recognized: string) => {
    if (!recognized.trim()) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    placeCaretAtEnd(el);
    if (el.innerText.trim()) insertAtCursor("\n\n");
    insertAtCursor(recognized);
  }, [insertAtCursor]);

  /** Full-text AI actions replace the whole editable body with plain text
   * (footnote markers are not preserved through this operation yet). */
  const replaceAllText = useCallback((newText: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerText = newText;
    recomputeCounts();
  }, [recomputeCounts]);

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
    const el = editorRef.current;
    if (!el) return;

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
  }, [footnotes]);

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
              الكلمات: {counts.words} — الحروف: {counts.chars}
            </span>
          </div>
          <SpecialCharsToolbar onInsert={insertAtCursor} />
          <div className="relative flex-1 overflow-auto">
            {isEmpty && (
              <span className="pointer-events-none absolute right-5 top-5 font-naskh text-lg text-ink-soft/60">
                ابدأ كتابة نص التحقيق هنا…
              </span>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={recomputeCounts}
              dir="rtl"
              className="h-full min-h-full whitespace-pre-wrap bg-transparent p-5 font-naskh text-lg leading-loose text-ink outline-none"
            />
          </div>
          <FootnotesPanel
            entries={footnotes}
            onInsert={insertFootnote}
            onChangeText={updateFootnoteText}
            onToggleInclude={toggleFootnoteInclude}
          />
          <AssistToolbar
            getText={() => editorRef.current?.innerText ?? ""}
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
                      ({f.number}) [{f.category}] {f.text || "—"}
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
