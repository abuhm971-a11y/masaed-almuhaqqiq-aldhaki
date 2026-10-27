import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FolderOpen, ZoomIn, ZoomOut } from "lucide-react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { AssistToolbar } from "./components/AssistToolbar";
import { CompareCopiesPanel } from "./components/CompareCopiesPanel";
import { FootnotesPanel } from "./components/FootnotesPanel";
import { FormatToolbar } from "./components/FormatToolbar";
import { MergeTool } from "./components/MergeTool";
import { ReferenceBankPanel } from "./components/ReferenceBankPanel";
import { ResizeHandle } from "./components/ResizeHandle";
import { SidePanel } from "./components/SidePanel";
import { SpecialCharsToolbar } from "./components/SpecialCharsToolbar";
import {
  DEFAULT_EDITOR_FONT,
  DEFAULT_SIDE_WIDTH,
  FOOTNOTE_CATEGORIES,
  MAX_EDITOR_FONT,
  MAX_SIDE_WIDTH,
  MIN_CENTER_WIDTH,
  MIN_EDITOR_FONT,
  MIN_SIDE_WIDTH,
} from "./constants";
import { downloadTextFile } from "./lib/download";
import { FootnoteMark } from "./lib/footnoteExtension";
import { buildProjectFile, parseProjectFile } from "./lib/projectFile";
import { loadCards, saveCards } from "./lib/referenceStore";
import type {
  FootnoteCategoryKey,
  FootnoteEntry,
  PanelState,
  ReferenceCard,
  RegisteredCopy,
  SyncMode,
} from "./types";

export default function App() {
  const [manuscriptState, setManuscriptState] = useState<PanelState>("expanded");
  const [printedState, setPrintedState] = useState<PanelState>("expanded");
  const [manuscriptWidth, setManuscriptWidth] = useState(DEFAULT_SIDE_WIDTH);
  const [printedWidth, setPrintedWidth] = useState(DEFAULT_SIDE_WIDTH);
  const [syncMode, setSyncMode] = useState<SyncMode>("independent");
  const [footnotes, setFootnotes] = useState<FootnoteEntry[]>([]);

  /** Researcher-entered reference cards; kept in the browser's own storage
   * so they survive a reload (the document itself is saved/opened through
   * the project file). */
  const [referenceCards, setReferenceCards] = useState<ReferenceCard[]>(() => loadCards());
  useEffect(() => {
    saveCards(referenceCards);
  }, [referenceCards]);
  const [editorFontSize, setEditorFontSize] = useState(DEFAULT_EDITOR_FONT);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  /** Every copy's registration from both side panels (status, order,
   * transcript) — feeds both the comparison tool and the merge tool. */
  const [registeredCopies, setRegisteredCopies] = useState<RegisteredCopy[]>([]);
  const onCopyUpdate = useCallback(
    (side: "manuscript" | "printed") =>
      (c: { id: string; label: string; orderKey: number; status: RegisteredCopy["status"]; transcript: string }) => {
        setRegisteredCopies((prev) => {
          const others = prev.filter((t) => !(t.id === c.id && t.side === side));
          return [...others, { ...c, side }];
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
          "h-full min-h-full whitespace-pre-wrap bg-transparent p-5 font-naskh text-[length:var(--editor-fs,18px)] leading-loose text-ink outline-none",
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

  /** Inserts the merged, approved-pages text at the end of the document,
   * separated by a couple of line breaks if the document already has
   * content. Called only from the explicit merge-confirmation step. */
  const insertMergedText = useCallback((merged: string) => {
    if (!merged.trim() || !editor) return;
    const chain = editor.chain().focus("end");
    if (!editor.isEmpty) chain.setHardBreak().setHardBreak();
    chain.insertContent(merged).run();
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

  const addReferenceCard = useCallback((card: ReferenceCard) => {
    setReferenceCards((prev) => [...prev, card]);
  }, []);
  const deleteReferenceCard = useCallback((id: string) => {
    setReferenceCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  /** Saves the document (as ProseMirror JSON so footnote markers keep their
   * ids), its footnotes and the reference cards to a .json project file.
   * Page images and per-page transcripts live inside the side panels and
   * are not part of this file yet. */
  const saveProject = useCallback(() => {
    if (!editor) return;
    const json = buildProjectFile(
      editor.getJSON() as { type: "doc"; content?: unknown[] },
      footnotes,
      referenceCards
    );
    downloadTextFile("مشروع-مساعد-المحقق.json", json, "application/json;charset=utf-8");
  }, [editor, footnotes, referenceCards]);

  const openProjectFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !editor) return;
      try {
        const project = parseProjectFile(await file.text());
        if (
          !editor.isEmpty &&
          !window.confirm("سيُستبدل النص الحالي والحواشي بمحتوى ملف المشروع. هل تريد المتابعة؟")
        ) {
          return;
        }
        editor.commands.setContent(project.document);
        setFootnotes(project.footnotes);
        setReferenceCards((prev) => {
          const known = new Set(prev.map((c) => c.id));
          return [...prev, ...project.referenceCards.filter((c) => !known.has(c.id))];
        });
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "تعذّر فتح ملف المشروع");
      }
    },
    [editor]
  );

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
            onClick={saveProject}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
            title="حفظ النص والحواشي وبطاقات المراجع في ملف"
          >
            <Download size={14} />
            <span>حفظ المشروع</span>
          </button>
          <button
            onClick={() => projectFileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
            title="فتح ملف مشروع محفوظ"
          >
            <FolderOpen size={14} />
            <span>فتح مشروع</span>
          </button>
          <input
            ref={projectFileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              void openProjectFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

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
          onCopyUpdate={onCopyUpdate("manuscript")}
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
            <div className="flex items-center gap-1 text-xs text-ink-soft">
              <button
                onClick={() => setEditorFontSize((v) => Math.max(MIN_EDITOR_FONT, v - 2))}
                className="rounded p-1 hover:bg-paper-dim"
                title="تصغير خط النص"
              >
                <ZoomOut size={14} />
              </button>
              <span className="w-9 text-center font-ui">{editorFontSize}px</span>
              <button
                onClick={() => setEditorFontSize((v) => Math.min(MAX_EDITOR_FONT, v + 2))}
                className="rounded p-1 hover:bg-paper-dim"
                title="تكبير خط النص"
              >
                <ZoomIn size={14} />
              </button>
            </div>
            <span className="text-xs text-ink-soft">
              الكلمات: {editor && editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0} — الحروف: {editor?.getText().length ?? 0}
            </span>
          </div>
          <FormatToolbar editor={editor} />
          <SpecialCharsToolbar onInsert={insertAtCursor} />
          <div
            ref={editorWrapperRef}
            className="relative flex-1 overflow-auto"
            style={{ ["--editor-fs" as string]: `${editorFontSize}px` }}
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
          <MergeTool copies={registeredCopies} onMerge={insertMergedText} />
          <CompareCopiesPanel copies={registeredCopies} onInsertFootnote={insertFootnote} />
          <ReferenceBankPanel
            cards={referenceCards}
            onAddCard={addReferenceCard}
            onDeleteCard={deleteReferenceCard}
            onInsertFootnote={insertFootnote}
          />
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
          onCopyUpdate={onCopyUpdate("printed")}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const notes = printFootnoteList.map((f) => `(${f.number}) ${f.text}`).join("\n");
                    downloadTextFile(
                      "النص-المحقق.txt",
                      printFootnoteList.length ? `${printBodyText}\n\n————————\n${notes}\n` : `${printBodyText}\n`
                    );
                  }}
                  disabled={!printBodyText}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim disabled:opacity-40"
                >
                  <Download size={14} />
                  <span>تنزيل نصي</span>
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="rounded-md border border-border px-3 py-1 text-sm text-ink-soft hover:bg-paper-dim"
                >
                  إغلاق
                </button>
              </div>
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
