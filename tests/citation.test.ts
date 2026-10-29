import { describe, expect, it } from "vitest";
import {
  appendCitation,
  formatCard,
  formatCitation,
  targetCategory,
} from "../src/lib/citation";
import type { ReferenceCard } from "../src/types";

const card = (over: Partial<ReferenceCard> = {}): ReferenceCard => ({
  id: "c1",
  category: "hadith",
  title: "صحيح البخاري",
  author: "البخاري",
  details: "كتاب الإيمان، حديث 1",
  excerpt: "إنما الأعمال بالنيات",
  ...over,
});

/** The exact formula the panel used before extraction, kept as an oracle. */
function legacy(cards: ReferenceCard[], phrase: string, a: boolean, e: boolean) {
  const parts = cards.map((c) => {
    const head = [c.title, a ? c.author : "", c.details].map((x) => x.trim()).filter(Boolean).join("، ");
    return e && c.excerpt.trim() ? `${head}: «${c.excerpt.trim()}»` : head;
  });
  return `${phrase ? phrase + " " : ""}${parts.join("؛ و")}.`;
}

describe("formatCitation", () => {
  it("matches the previous panel output exactly (location only)", () => {
    const cs = [card(), card({ id: "c2", title: "صحيح مسلم", details: "كتاب الإمارة" })];
    expect(formatCitation(cs, "أخرجه")).toBe(legacy(cs, "أخرجه", false, false));
  });

  it("matches the previous output with author and excerpt", () => {
    const cs = [card()];
    const style = { includeAuthor: true, includeExcerpt: true };
    expect(formatCitation(cs, "ينظر:", {}, style)).toBe(legacy(cs, "ينظر:", true, true));
  });

  it("location-only omits the quoted text; full style adds it", () => {
    expect(formatCitation([card()], "أخرجه")).not.toContain("إنما");
    expect(formatCitation([card()], "أخرجه", {}, { includeAuthor: false, includeExcerpt: true })).toContain(
      "«إنما الأعمال بالنيات»"
    );
  });

  it("applies a different style per reference type", () => {
    const cs = [card(), card({ id: "r", category: "rijal", title: "تهذيب الكمال", details: "ج1 ص5", excerpt: "ترجمة" })];
    const out = formatCitation(cs, "", {
      hadith: { includeAuthor: false, includeExcerpt: false },
      rijal: { includeAuthor: false, includeExcerpt: true },
    });
    expect(out).toContain("صحيح البخاري، كتاب الإيمان، حديث 1؛ و");
    expect(out).toContain("«ترجمة»");
    expect(out).not.toContain("إنما");
  });

  it("no cards or empty cards produce an empty string, never a lone period", () => {
    expect(formatCitation([], "أخرجه")).toBe("");
    expect(formatCitation([card({ title: "", details: "", author: "", excerpt: "" })], "أخرجه")).toBe("");
  });

  it("an excerpt requested but absent is silently omitted, nothing invented", () => {
    expect(formatCard(card({ excerpt: "" }), { includeAuthor: false, includeExcerpt: true })).toBe(
      "صحيح البخاري، كتاب الإيمان، حديث 1"
    );
  });

  it("a closing quotation still takes its full stop", () => {
    const out = formatCitation([card()], "", {}, { includeAuthor: false, includeExcerpt: true });
    expect(out.endsWith("».")).toBe(true);
  });

  it("never doubles a stop the text already ends with", () => {
    const out = formatCitation([card({ details: "ج1 ص5 ط." })], "");
    expect(out.endsWith("..")).toBe(false);
    expect(out.endsWith("ط.")).toBe(true);
  });

  it("works without an opening phrase", () => {
    expect(formatCitation([card()], "")).toBe("صحيح البخاري، كتاب الإيمان، حديث 1.");
  });
});

describe("targetCategory", () => {
  it("maps by the first checked card; defaults to takhrij", () => {
    expect(targetCategory([])).toBe("takhrij");
    expect(targetCategory([card({ category: "lugha" })])).toBe("gharib");
    expect(targetCategory([card({ category: "rijal" }), card({ category: "lugha" })])).toBe("takhrij");
  });
});

describe("appendCitation", () => {
  it("fills an empty footnote", () => {
    expect(appendCitation("", "أخرجه البخاري.")).toBe("أخرجه البخاري.");
  });
  it("keeps what the researcher already typed", () => {
    expect(appendCitation("قال المحقق:", "ينظر: كذا.")).toBe("قال المحقق: ينظر: كذا.");
    expect(appendCitation("كذا في الأصل", "ينظر: كذا.")).toBe("كذا في الأصل، ينظر: كذا.");
  });
  it("never inserts the same citation twice (double click)", () => {
    const once = appendCitation("", "أخرجه البخاري.");
    expect(appendCitation(once, "أخرجه البخاري.")).toBe(once);
  });
  it("an empty citation leaves the text untouched", () => {
    expect(appendCitation("نص", "  ")).toBe("نص");
  });
});
