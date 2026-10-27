import { PROJECT_FORMAT } from "../constants";
import type { FootnoteEntry, ReferenceCard } from "../types";
import { sanitizeCards } from "./referenceStore";

export type ProjectFile = {
  format: typeof PROJECT_FORMAT;
  version: 1;
  savedAt: string;
  /** ProseMirror JSON (not HTML) so footnote markers keep their ids. */
  document: { type: "doc"; content?: unknown[] };
  footnotes: FootnoteEntry[];
  referenceCards: ReferenceCard[];
};

export function buildProjectFile(
  document: ProjectFile["document"],
  footnotes: FootnoteEntry[],
  referenceCards: ReferenceCard[]
): string {
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    document,
    footnotes,
    referenceCards,
  };
  return JSON.stringify(file, null, 2);
}

/** Parses and validates a project file; throws an Arabic error message
 * when the file isn't one of ours. */
export function parseProjectFile(text: string): ProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("الملف ليس بصيغة JSON صحيحة");
  }
  const d = data as Partial<ProjectFile> | null;
  if (!d || d.format !== PROJECT_FORMAT) throw new Error("هذا الملف ليس ملف مشروع لمساعد المحقق");
  if (!d.document || d.document.type !== "doc") throw new Error("ملف المشروع لا يحوي نصاً صالحاً");
  const footnotes = Array.isArray(d.footnotes) ? (d.footnotes as FootnoteEntry[]) : [];
  return {
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : "",
    document: d.document,
    footnotes,
    referenceCards: sanitizeCards(d.referenceCards),
  };
}
