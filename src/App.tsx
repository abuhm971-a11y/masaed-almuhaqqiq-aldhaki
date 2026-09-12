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

const ASSIST_ACTIONS = [
  { key: "tashkeel", label: "تشكيل" },
  { key: "tasheeh", label: "تصحيح" },
  { key: "hamzat", label: "توحيد الهمزات" },
  { key: "tarqeem", label: "ترقيم" },
  { key: "faharis", label: "فهارس" },
] as const;

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

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);

    if (!file.type.startsWith("image/")) {
      setImageUrl(null);
      return;
    }

    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

    setBusy(true);
    try {
      const text = await transcribeImage(file);
      onTextRecognized(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تفريغ النص من الصورة");
    } finally {
      setBusy(false);
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto p-3"
      >
        {fileName ? (
          <div className="flex h-full flex-col items-center gap-2 text-center text-sm text-ink-soft">
            {imageUrl && (
              <img
                src={imageUrl}
                alt={fileName}
                className="max-h-[70%] w-full rounded-md border border-border object-contain"
              />
            )}
            <span className="text-xs">{fileName}</span>
            {busy && <span className="text-xs text-bronze">جارٍ التفريغ النصي…</span>}
            {error && <span className="text-xs text-red-700">{error}</span>}
            <label className="mt-1 cursor-pointer text-xs text-bronze underline">
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
      </div>
    </div>
  );
}

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

function FootnotesPanel({
  counts,
  onInsert,
}: {
  counts: Record<FootnoteCategoryKey, number>;
  onInsert: (categoryKey: FootnoteCategoryKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-paper-dim/40 px-3 py-2">
      <span className="text-xs font-semibold text-ink-soft">حواشي المتن:</span>
      {FOOTNOTE_CATEGORIES.map((cat) => (
        <button
          key={cat.key}
          onClick={() => onInsert(cat.key)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-white/60 px-3 py-1 text-xs text-ink hover:bg-white"
          title={`إدراج حاشية: ${cat.label}`}
        >
          <span>{cat.label}</span>
          <span className="rounded-full bg-bronze-light/50 px-1.5 text-[10px] text-ink">
            {counts[cat.key]}
          </span>
          <span className="text-bronze">＋</span>
        </button>
      ))}
    </div>
  );
}

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
  const [footnoteCounts, setFootnoteCounts] = useState<Record<FootnoteCategoryKey, number>>({
    takhrij: 0,
    furuq: 0,
    gharib: 0,
    tahqiq: 0,
  });

  const manuscriptScrollRef = useRef<HTMLDivElement>(null);
  const printedScrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

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

  const placeCaretAtEnd = (el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

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

  const insertFootnote = useCallback((categoryKey: FootnoteCategoryKey) => {
    const el = editorRef.current;
    if (!el) return;

    const nextIndex = footnoteCounts[categoryKey] + 1;
    const label = FOOTNOTE_CATEGORIES.find((c) => c.key === categoryKey)!.label;

    const sel = window.getSelection();
    const selectionInsideEditor =
      sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!selectionInsideEditor) {
      el.focus();
      placeCaretAtEnd(el);
    }

    const marker = document.createElement("sup");
    marker.contentEditable = "false";
    marker.dataset.category = categoryKey;
    marker.dataset.index = String(nextIndex);
    marker.title = `${label} #${nextIndex}`;
    marker.className =
      "mx-0.5 cursor-help rounded bg-bronze-light/60 px-1 text-[11px] font-ui text-ink";
    marker.textContent = String(nextIndex);

    const spacer = document.createTextNode("\u200b");

    const range = window.getSelection()!.getRangeAt(0);
    range.deleteContents();
    range.insertNode(spacer);
    range.insertNode(marker);
    range.setStartAfter(spacer);
    range.setEndAfter(spacer);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    recomputeCounts();
    setFootnoteCounts((prev) => ({ ...prev, [categoryKey]: nextIndex }));
  }, [footnoteCounts, recomputeCounts]);

  const appendRecognizedText = useCallback((recognized: string) => {
    if (!recognized.trim()) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    placeCaretAtEnd(el);
    if (el.innerText.trim()) insertAtCursor("\n\n");
    insertAtCursor(recognized);
  }, [insertAtCursor]);

  const replaceAllText = useCallback((newText: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerText = newText;
    recomputeCounts();
  }, [recomputeCounts]);

  return (
    <div className="flex h-screen flex-col bg-paper font-ui">
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
          <FootnotesPanel counts={footnoteCounts} onInsert={insertFootnote} />
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
    </div>
  );
}
