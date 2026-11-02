import { REFERENCE_TO_FOOTNOTE } from "../constants";
import type { FootnoteCategoryKey, ReferenceCard, ReferenceCategoryKey } from "../types";

/** How one reference type is documented: location data only, or with the
 * author and/or the quoted passage. Configurable per type. */
export type CitationStyle = { includeAuthor: boolean; includeExcerpt: boolean };

export const DEFAULT_STYLE: CitationStyle = { includeAuthor: false, includeExcerpt: false };

export type StyleMap = Partial<Record<ReferenceCategoryKey, CitationStyle>>;

const clean = (s: string) => s.trim();

/** One card rendered per the given style. Nothing is invented: only
 * fields the researcher typed appear, and an excerpt is added only when
 * the style asks for it AND the card has one. */
export function formatCard(card: ReferenceCard, style: CitationStyle = DEFAULT_STYLE): string {
  const head = [card.title, style.includeAuthor ? card.author : "", card.details]
    .map(clean)
    .filter(Boolean)
    .join("، ");
  const quote = clean(card.excerpt);
  return style.includeExcerpt && quote ? `${head}: «${quote}»` : head;
}

/** The full footnote text for the checked cards. `styles` lets each
 * reference type carry its own documentation style; `fallback` applies
 * to types without one. Cards with nothing to say are skipped. */
export function formatCitation(
  cards: readonly ReferenceCard[],
  phrase: string,
  styles: StyleMap = {},
  fallback: CitationStyle = DEFAULT_STYLE
): string {
  const parts = cards
    .map((c) => formatCard(c, styles[c.category] ?? fallback))
    .filter(Boolean);
  if (parts.length === 0) return "";
  const lead = clean(phrase);
  const body = `${lead ? lead + " " : ""}${parts.join("؛ و")}`;
  // a closing quotation still takes its full stop (« … ».) as before; only
  // a text that already ends with a stop mark is left alone
  return /[.…؟!]$/.test(body) ? body : `${body}.`;
}

/** Footnote category a set of checked cards belongs under — the first
 * card decides (same rule the panel has always used). */
export function targetCategory(cards: readonly ReferenceCard[]): FootnoteCategoryKey {
  return cards.length ? REFERENCE_TO_FOOTNOTE[cards[0].category] : "takhrij";
}

/** Appends a citation to a footnote that may already hold text, without
 * overwriting what the researcher typed. */
export function appendCitation(existing: string, citation: string): string {
  const base = existing.trim();
  const add = citation.trim();
  if (!add) return existing;
  if (!base) return add;
  if (base.includes(add)) return existing; // never insert the same citation twice
  const sep = /[.…»؟!؛:]$/.test(base) ? " " : "، ";
  return `${base}${sep}${add}`;
}
