import { useMemo, useState } from "react";
import { Library, Plus, Search, Trash2 } from "lucide-react";
import {
  CONNECTOR_PHRASES,
  FOOTNOTE_CATEGORIES,
  REFERENCE_CATEGORIES,
} from "../constants";
import { formatCitation, targetCategory } from "../lib/citation";
import type { FootnoteCategoryKey, ReferenceCard, ReferenceCategoryKey } from "../types";

const CUSTOM = "__custom__";

const EMPTY_DRAFT = {
  category: "hadith" as ReferenceCategoryKey,
  title: "",
  author: "",
  details: "",
  excerpt: "",
};

/** Reference-card bank and footnote composer. The researcher enters cards
 * (source title, author, exact location, optional quoted passage); ticking
 * one or more cards shows a live preview of the footnote wording, and only
 * an explicit "إدراج" click inserts it at the caret as a tagged footnote.
 * Nothing is generated or cited automatically, and no sample citations are
 * pre-loaded — the bank contains only what a human entered. The same
 * search box looks through the bank's titles, authors, locations and
 * excerpts. */
export function ReferenceBankPanel({
  cards,
  onAddCard,
  onDeleteCard,
  onInsertFootnote,
}: {
  cards: ReferenceCard[];
  onAddCard: (card: ReferenceCard) => void;
  onDeleteCard: (id: string) => void;
  onInsertFootnote: (categoryKey: FootnoteCategoryKey, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ReferenceCategoryKey | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [phraseChoice, setPhraseChoice] = useState<string>(CONNECTOR_PHRASES[0]);
  const [customPhrase, setCustomPhrase] = useState("");
  const [includeAuthor, setIncludeAuthor] = useState(false);
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [targetOverride, setTargetOverride] = useState<FootnoteCategoryKey | "auto">("auto");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const visible = useMemo(() => {
    const q = query.trim();
    return cards.filter((c) => {
      if (filter !== "all" && c.category !== filter) return false;
      if (!q) return true;
      return [c.title, c.author, c.details, c.excerpt].some((f) => f.includes(q));
    });
  }, [cards, filter, query]);

  const chosen = cards.filter((c) => selected.includes(c.id));
  const phrase = phraseChoice === CUSTOM ? customPhrase.trim() : phraseChoice;

  const preview = useMemo(
    () => formatCitation(chosen, phrase, {}, { includeAuthor, includeExcerpt }),
    [chosen, phrase, includeAuthor, includeExcerpt]
  );

  const autoTarget: FootnoteCategoryKey = targetCategory(chosen);
  const target = targetOverride === "auto" ? autoTarget : targetOverride;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const insert = () => {
    if (!preview) return;
    onInsertFootnote(target, preview);
    setSelected([]);
  };

  const saveDraft = () => {
    if (!draft.title.trim()) return;
    onAddCard({
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: draft.category,
      title: draft.title.trim(),
      author: draft.author.trim(),
      details: draft.details.trim(),
      excerpt: draft.excerpt.trim(),
    });
    setDraft({ ...EMPTY_DRAFT, category: draft.category });
    setAdding(false);
  };

  const labelOf = (key: ReferenceCategoryKey) =>
    REFERENCE_CATEGORIES.find((c) => c.key === key)!.label;

  const field =
    "w-full rounded-md border border-border bg-white/80 px-2 py-1 text-xs text-ink outline-none placeholder:text-ink-soft/50";

  return (
    <div className="border-t border-border bg-paper-dim/40 px-3 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-white/60 px-3 py-1 text-xs text-ink hover:bg-white"
      >
        <Library size={14} />
        <span>بنك المراجع</span>
        <span className="rounded-full bg-bronze-light/50 px-1.5 text-[10px]">{cards.length}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-white/70 p-2" dir="rtl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search size={13} className="pointer-events-none absolute right-2 top-1.5 text-ink-soft" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث في المراجع المدخلة…"
                className={`${field} pr-7`}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[{ key: "all", label: "الكل" }, ...REFERENCE_CATEGORIES].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key as ReferenceCategoryKey | "all")}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    filter === c.key
                      ? "border-bronze bg-bronze-light/50 text-ink"
                      : "border-border bg-white/60 text-ink-soft hover:bg-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-border bg-white/60 px-2 py-1 text-[11px] text-ink hover:bg-white"
            >
              <Plus size={13} />
              <span>بطاقة جديدة</span>
            </button>
          </div>

          {adding && (
            <div className="grid grid-cols-1 gap-1.5 rounded-md border border-border/70 bg-paper-dim/40 p-2 sm:grid-cols-2">
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ReferenceCategoryKey })}
                className={field}
              >
                {REFERENCE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="عنوان المصدر"
                className={field}
              />
              <input
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                placeholder="المؤلف"
                className={field}
              />
              <input
                value={draft.details}
                onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                placeholder="موضع العزو (الكتاب، الباب، الرقم، الجزء/الصفحة)"
                className={field}
              />
              <textarea
                value={draft.excerpt}
                onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
                placeholder="مقتطف من النص (اختياري)"
                rows={2}
                className={`${field} font-naskh text-sm sm:col-span-2`}
              />
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button
                  onClick={() => {
                    setAdding(false);
                    setDraft(EMPTY_DRAFT);
                  }}
                  className="rounded-md border border-border px-3 py-1 text-xs text-ink-soft hover:bg-paper-dim"
                >
                  إلغاء
                </button>
                <button
                  onClick={saveDraft}
                  disabled={!draft.title.trim()}
                  className="rounded-md border border-bronze bg-bronze-light/50 px-3 py-1 text-xs text-ink disabled:opacity-40"
                >
                  حفظ البطاقة
                </button>
              </div>
            </div>
          )}

          <div className="max-h-52 space-y-1 overflow-auto">
            {cards.length === 0 && (
              <p className="px-1 py-3 text-center text-xs text-ink-soft">
                لا توجد بطاقات بعد. أضف المصادر التي تعتمدها بنفسك؛ لا يملأ البرنامج أي مرجع من عنده.
              </p>
            )}
            {cards.length > 0 && visible.length === 0 && (
              <p className="px-1 py-3 text-center text-xs text-ink-soft">لا نتائج مطابقة.</p>
            )}
            {visible.map((c) => (
              <div
                key={c.id}
                className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
                  selected.includes(c.id) ? "border-bronze bg-bronze-light/30" : "border-border/60 bg-white/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-bronze"
                />
                <div className="min-w-0 flex-1 text-xs leading-relaxed text-ink">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{c.title}</span>
                    <span className="rounded-full bg-paper-dim px-1.5 text-[10px] text-ink-soft">
                      {labelOf(c.category)}
                    </span>
                  </div>
                  {(c.author || c.details) && (
                    <div className="text-ink-soft">{[c.author, c.details].filter(Boolean).join(" — ")}</div>
                  )}
                  {c.excerpt && <div className="font-naskh text-sm text-ink-soft">«{c.excerpt}»</div>}
                </div>
                <button
                  onClick={() => {
                    onDeleteCard(c.id);
                    setSelected((prev) => prev.filter((x) => x !== c.id));
                  }}
                  title="حذف البطاقة من البنك"
                  className="shrink-0 rounded p-1 text-ink-soft hover:bg-paper-dim hover:text-ink"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border/60 pt-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <span>صيغة الافتتاح:</span>
              <select
                value={phraseChoice}
                onChange={(e) => setPhraseChoice(e.target.value)}
                className="rounded-md border border-border bg-white/80 px-2 py-1 text-xs text-ink"
              >
                {CONNECTOR_PHRASES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value={CUSTOM}>صيغة مخصصة…</option>
              </select>
              {phraseChoice === CUSTOM && (
                <input
                  value={customPhrase}
                  onChange={(e) => setCustomPhrase(e.target.value)}
                  placeholder="اكتب الصيغة"
                  className="min-w-[8rem] flex-1 rounded-md border border-border bg-white/80 px-2 py-1 text-xs text-ink outline-none"
                />
              )}
              <span>الحاشية في:</span>
              <select
                value={targetOverride}
                onChange={(e) => setTargetOverride(e.target.value as FootnoteCategoryKey | "auto")}
                className="rounded-md border border-border bg-white/80 px-2 py-1 text-xs text-ink"
              >
                <option value="auto">
                  تلقائي ({FOOTNOTE_CATEGORIES.find((c) => c.key === autoTarget)!.label})
                </option>
                {FOOTNOTE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={includeAuthor}
                  onChange={(e) => setIncludeAuthor(e.target.checked)}
                  className="h-3.5 w-3.5 accent-bronze"
                />
                <span>ذكر المؤلف</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={includeExcerpt}
                  onChange={(e) => setIncludeExcerpt(e.target.checked)}
                  className="h-3.5 w-3.5 accent-bronze"
                />
                <span>إثبات المقتطف</span>
              </label>
            </div>
            <div
              className="min-h-[2.75rem] rounded-md border border-border bg-white/80 p-2 font-naskh text-base leading-relaxed text-ink"
              aria-live="polite"
            >
              {preview || (
                <span className="text-xs text-ink-soft/70">
                  أشّر على مرجع واحد أو أكثر لتظهر معاينة نص الحاشية قبل إدراجها.
                </span>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={insert}
                disabled={!preview}
                className="rounded-md border border-bronze bg-bronze-light/50 px-3 py-1 text-xs text-ink disabled:opacity-40"
                title="يُدرج رمز الحاشية عند موضع المؤشر في النص"
              >
                إدراج الحاشية عند المؤشر
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
