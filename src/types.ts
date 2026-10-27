import { FOOTNOTE_CATEGORIES, IMAGE_NOTE_CATEGORIES, REFERENCE_CATEGORIES } from "./constants";

export type SyncMode = "independent" | "manuscript" | "printed";

export type PanelSide = "right" | "left";

export type PanelState = "expanded" | "collapsed" | "hidden";

export type FootnoteCategoryKey = (typeof FOOTNOTE_CATEGORIES)[number]["key"];

export type FootnoteEntry = {
  id: string;
  category: FootnoteCategoryKey;
  index: number;
  text: string;
  includeInPrint: boolean;
};

export type ImageNoteCategoryKey = (typeof IMAGE_NOTE_CATEGORIES)[number]["key"];

export type ImageNoteEntry = {
  id: string;
  category: ImageNoteCategoryKey;
  index: number;
  text: string;
};

/** One manuscript/printed copy within a side panel: its own image, OCR
 * status, split-tool state, and description/comment notes. Multiple
 * copies live inside the SAME panel as tabs — this is not multiple
 * panels, per the corrected design (comparison across copies is logical,
 * via tagged variant footnotes, not a side-by-side visual layout).
 * `orderKey` is a decimal position: a split page's right half keeps the
 * original's orderKey, the left half gets orderKey + 0.5, so inserting a
 * split page never requires renumbering any other page. */
export type Copy = {
  id: string;
  label: string;
  orderKey: number;
  fileName: string | null;
  imageUrl: string | null;
  busy: boolean;
  error: string | null;
  /** This copy's own OCR'd text, kept separately from whatever ends up
   * in the main editor — needed so two copies can be diffed against each
   * other for the "فروق النسخ" comparison tool, and so merging into the
   * main text is an explicit, reviewable step rather than automatic. */
  transcript: string;
  /** Whether the researcher has explicitly reviewed and approved this
   * transcript for inclusion in the final merge. Vision-model OCR can
   * "hallucinate" plausible text on historical scripts, so nothing is
   * auto-inserted — editing the transcript after approval un-approves it. */
  approved: boolean;
  notes: ImageNoteEntry[];
  splitMode: boolean;
  splitX: number;
  crops: { left: string; right: string } | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  applied?: boolean;
  dismissed?: boolean;
  error?: boolean;
};

export type RegisteredCopy = {
  id: string;
  side: "manuscript" | "printed";
  label: string;
  orderKey: number;
  status: "not_transcribed" | "draft" | "approved";
  transcript: string;
};

export type ReferenceCategoryKey = (typeof REFERENCE_CATEGORIES)[number]["key"];

/** A reference card entered by the researcher (hadith / fiqh / rijal /
 * language source). Cards are never pre-filled with invented citations —
 * every field is typed or pasted by the user, so any citation that ends
 * up in a footnote traces back to something a human entered. */
export type ReferenceCard = {
  id: string;
  category: ReferenceCategoryKey;
  title: string;
  author: string;
  /** Location of the cited passage: book/chapter, hadith number, volume/page… */
  details: string;
  /** Optional quoted passage, inserted only when the user asks for it. */
  excerpt: string;
};
