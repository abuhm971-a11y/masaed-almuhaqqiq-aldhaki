import type { ReferenceCategoryKey } from "../types";
import type { CitationStyle, StyleMap } from "./citation";

/** Where the researcher's per-type choices are kept in this browser. */
export const STYLES_KEY = "masaed-citation-styles";

export const STYLE_PRESETS = [
  { key: "default", label: "الافتراضي (حسب الخيارين أعلاه)", style: null },
  { key: "location", label: "الموقع فقط", style: { includeAuthor: false, includeExcerpt: false } },
  { key: "author", label: "مع المؤلف", style: { includeAuthor: true, includeExcerpt: false } },
  { key: "excerpt", label: "مع المقتطف", style: { includeAuthor: false, includeExcerpt: true } },
  { key: "full", label: "مع المؤلف والمقتطف", style: { includeAuthor: true, includeExcerpt: true } },
] as const;

const CATEGORIES: readonly ReferenceCategoryKey[] = ["hadith", "fiqh", "rijal", "lugha"];

/** Which preset a type's stored style corresponds to ("default" = none). */
export function presetKeyOf(style: CitationStyle | undefined): string {
  if (!style) return "default";
  const hit = STYLE_PRESETS.find(
    (p) =>
      p.style && p.style.includeAuthor === style.includeAuthor && p.style.includeExcerpt === style.includeExcerpt
  );
  return hit ? hit.key : "default";
}

/** A new map with one type's style changed; "default" removes the entry
 * so that type follows the general checkboxes again. */
export function setTypeStyle(map: StyleMap, category: ReferenceCategoryKey, presetKey: string): StyleMap {
  const preset = STYLE_PRESETS.find((p) => p.key === presetKey);
  const next: StyleMap = { ...map };
  if (!preset || !preset.style) delete next[category];
  else next[category] = { ...preset.style };
  return next;
}

/** Reads the saved map defensively: anything malformed is ignored, never
 * thrown, so a damaged value can't break the panel. */
export function parseStyles(raw: string | null): StyleMap {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    const out: StyleMap = {};
    for (const c of CATEGORIES) {
      const s = (data as Record<string, unknown>)[c];
      if (
        s && typeof s === "object" &&
        typeof (s as CitationStyle).includeAuthor === "boolean" &&
        typeof (s as CitationStyle).includeExcerpt === "boolean"
      ) {
        out[c] = {
          includeAuthor: (s as CitationStyle).includeAuthor,
          includeExcerpt: (s as CitationStyle).includeExcerpt,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}
