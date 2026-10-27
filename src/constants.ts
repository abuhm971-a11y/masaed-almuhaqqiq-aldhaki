export const MIN_CENTER_WIDTH = 360;

export const DEFAULT_SIDE_WIDTH = 340;

export const MIN_SIDE_WIDTH = 220;

export const MAX_SIDE_WIDTH = 640;

export const SPECIAL_CHARS = ["﴿", "﴾", "«", "»", "[", "]", "(", ")", "…"];

export const FOOTNOTE_CATEGORIES = [
  { key: "takhrij", label: "التخريج والعزو" },
  { key: "furuq", label: "فروق النسخ" },
  { key: "gharib", label: "شرح الغريب" },
  { key: "tahqiq", label: "تعليقات المحقق" },
] as const;


export const IMAGE_NOTE_CATEGORIES = [
  { key: "desc", label: "توصيف" },
  { key: "comment", label: "تعليق" },
] as const;


export const ASSIST_ACTIONS = [
  { key: "tashkeel", label: "تشكيل" },
  { key: "tasheeh", label: "تصحيح" },
  { key: "hamzat", label: "توحيد الهمزات" },
  { key: "tarqeem", label: "ترقيم" },
  { key: "faharis", label: "فهارس" },
] as const;

export const COPY_LABELS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"];

export const REFERENCE_CATEGORIES = [
  { key: "hadith", label: "حديث" },
  { key: "fiqh", label: "فقه" },
  { key: "rijal", label: "رجال ورواة" },
  { key: "lugha", label: "لغة وغريب" },
] as const;

/** Opening phrases offered for a reference footnote. A custom phrase can
 * always be typed instead; the researcher's own house-style wording will
 * replace or extend this list. */
export const CONNECTOR_PHRASES = ["أخرجه", "ينظر:", "تخريجه في:", "ترجمته في:"] as const;

/** Default footnote category for a reference card's category. */
export const REFERENCE_TO_FOOTNOTE = {
  hadith: "takhrij",
  fiqh: "takhrij",
  rijal: "takhrij",
  lugha: "gharib",
} as const;

export const REFERENCE_STORAGE_KEY = "masaed.referenceCards.v1";
export const PROJECT_FORMAT = "masaed-almuhaqqiq-project";
export const MIN_EDITOR_FONT = 14;
export const MAX_EDITOR_FONT = 32;
export const DEFAULT_EDITOR_FONT = 18;
