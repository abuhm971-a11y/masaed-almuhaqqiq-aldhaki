import { useCallback, useMemo, useRef, useState } from "react";

type SyncMode = "independent" | "manuscript" | "printed";
type PanelSide = "right" | "left";
type PanelState = "expanded" | "collapsed" | "hidden";

const MIN_CENTER_WIDTH = 360;
const DEFAULT_SIDE_WIDTH = 340;
const MIN_SIDE_WIDTH = 220;
const MAX_SIDE_WIDTH = 640;

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
}) {
  const [fileName, setFileName] = useState<string | null>(null);

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
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-ink-soft">
            <span>تم استيراد: {fileName}</span>
            <span className="text-xs opacity-70">
              (معاينة الصفحات ستُبنى في مرحلة لاحقة)
            </span>
          </div>
        ) : (
          <label className="flex h-full min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-ink-soft transition-colors hover:border-bronze hover:text-ink">
            <span className="text-2xl">＋</span>
            <span>استيراد كتاب كامل</span>
            <span className="text-xs opacity-70">PDF، ملف مضغوط، أو مجلد صور</span>
            <input
              type="file"
              accept=".pdf,.zip,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFileName(f.name);
              }}
            />
          </label>
        )}
      </div>
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
  const [text, setText] = useState("");

  const manuscriptScrollRef = useRef<HTMLDivElement>(null);
  const printedScrollRef = useRef<HTMLDivElement>(null);
  const centerScrollRef = useRef<HTMLTextAreaElement>(null);

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
    const dst = centerScrollRef.current;
    if (!src || !dst) return;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    dst.scrollTop = ratio * Math.max(1, dst.scrollHeight - dst.clientHeight);
  };

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/).length : 0),
    [text]
  );
  const charCount = text.length;

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
              الكلمات: {wordCount} — الحروف: {charCount}
            </span>
          </div>
          <textarea
            ref={centerScrollRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="rtl"
            placeholder="ابدأ كتابة نص التحقيق هنا…"
            className="flex-1 resize-none bg-transparent p-5 font-naskh text-lg leading-loose text-ink outline-none placeholder:text-ink-soft/60"
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
        />
      </main>
    </div>
  );
}
