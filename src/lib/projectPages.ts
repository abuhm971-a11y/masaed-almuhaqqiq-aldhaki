import type { ImageNoteEntry } from "../types";
import { archive, sanitizePage, type ArchivedPage } from "./archiveStore";

/** A page as stored inside the project file: JSON-safe, so the image is a
 * data: URL (or null when the file was saved without images). */
export type ProjectPage = {
  id: string;
  side: ArchivedPage["side"];
  label: string;
  orderKey: number;
  fileName: string | null;
  transcript: string;
  approved: boolean;
  notes: ImageNoteEntry[];
  imageDataUrl: string | null;
};

const DATA_IMAGE = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

export function dataUrlToBlob(url: string): Blob | null {
  if (!DATA_IMAGE.test(url)) return null;
  const comma = url.indexOf(",");
  const mime = url.slice(5, url.indexOf(";"));
  try {
    const binary = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** Archive pages → project-file pages. Without images the file stays small
 * and keeps everything else (text, approval, notes, order). */
export async function pagesToProject(
  pages: readonly ArchivedPage[],
  includeImages: boolean
): Promise<ProjectPage[]> {
  const out: ProjectPage[] = [];
  for (const p of pages) {
    out.push({
      id: p.id,
      side: p.side,
      label: p.label,
      orderKey: p.orderKey,
      fileName: p.fileName,
      transcript: p.transcript,
      approved: p.approved,
      notes: p.notes,
      imageDataUrl: includeImages && p.image ? await blobToDataUrl(p.image) : null,
    });
  }
  return out;
}

/** The file is untrusted input: keep only well-formed pages (same rules as
 * the archive), drop duplicates, and accept only real image data URLs. */
export function sanitizeProjectPages(raw: unknown): ProjectPage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProjectPage[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const base = sanitizePage({ ...(r as object), image: null });
    if (!base || seen.has(base.id)) continue;
    seen.add(base.id);
    const url = (r as { imageDataUrl?: unknown }).imageDataUrl;
    out.push({
      id: base.id,
      side: base.side,
      label: base.label,
      orderKey: base.orderKey,
      fileName: base.fileName,
      transcript: base.transcript,
      approved: base.approved,
      notes: base.notes,
      imageDataUrl: typeof url === "string" && DATA_IMAGE.test(url) ? url : null,
    });
  }
  return out;
}

export function projectToArchived(pages: readonly ProjectPage[]): ArchivedPage[] {
  return pages.map((p) => ({
    id: p.id,
    side: p.side,
    label: p.label,
    orderKey: p.orderKey,
    fileName: p.fileName,
    image: p.imageDataUrl ? dataUrlToBlob(p.imageDataUrl) : null,
    transcript: p.transcript,
    approved: p.approved,
    notes: p.notes,
    updatedAt: Date.now(),
  }));
}

/** Makes the archive equal to `pages`. New pages are written first and only
 * then are leftovers removed, so a failure midway never leaves the archive
 * emptier than it started. */
export async function replaceArchive(pages: readonly ArchivedPage[], dbName?: string): Promise<void> {
  const keep = new Set(pages.map((p) => p.id));
  for (const p of pages) await archive.save(p, dbName);
  for (const old of await archive.loadAll(dbName)) {
    if (!keep.has(old.id)) await archive.remove(old.id, dbName);
  }
}
