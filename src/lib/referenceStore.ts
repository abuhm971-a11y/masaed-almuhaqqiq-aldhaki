import { REFERENCE_CATEGORIES, REFERENCE_STORAGE_KEY } from "../constants";
import type { ReferenceCard } from "../types";

const VALID_CATEGORIES: string[] = REFERENCE_CATEGORIES.map((c) => c.key);

/** Keeps only well-formed cards, so a corrupted store or an imported file
 * can never break the panel. */
export function sanitizeCards(input: unknown): ReferenceCard[] {
  if (!Array.isArray(input)) return [];
  const out: ReferenceCard[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.title !== "string") continue;
    if (typeof c.category !== "string" || !VALID_CATEGORIES.includes(c.category)) continue;
    out.push({
      id: c.id,
      category: c.category as ReferenceCard["category"],
      title: c.title,
      author: typeof c.author === "string" ? c.author : "",
      details: typeof c.details === "string" ? c.details : "",
      excerpt: typeof c.excerpt === "string" ? c.excerpt : "",
    });
  }
  return out;
}

export function loadCards(): ReferenceCard[] {
  try {
    const raw = localStorage.getItem(REFERENCE_STORAGE_KEY);
    return raw ? sanitizeCards(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveCards(cards: ReferenceCard[]) {
  try {
    localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(cards));
  } catch {
    /* storage unavailable or full — cards simply stay in memory */
  }
}
