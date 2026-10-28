import { useEffect, useRef } from "react";
import { archive, type ArchivedPage } from "./archiveStore";
import { makeEmptyCopy } from "./copies";
import type { Copy } from "../types";

const SAVE_DELAY_MS = 500;

/** A tab with nothing in it (no image, text, or notes) is not worth
 * persisting — it would only resurrect an empty placeholder on reload. */
export const hasContent = (c: Copy) =>
  Boolean(c.imageUrl || c.transcript.trim() || c.notes.length);

/** Fingerprint of everything that is persisted for a copy, so unchanged
 * pages (and their image blobs) are not rewritten on every edit. */
export const copySignature = (c: Copy) =>
  JSON.stringify([c.label, c.orderKey, c.fileName, c.imageUrl, c.transcript, c.approved, c.notes]);

export function archivedToCopy(p: ArchivedPage): Copy {
  return {
    ...makeEmptyCopy(p.label, p.orderKey),
    id: p.id,
    fileName: p.fileName,
    imageUrl: p.image ? URL.createObjectURL(p.image) : null,
    transcript: p.transcript,
    approved: p.approved,
    notes: p.notes,
  };
}

/**
 * Keeps a side panel's pages in the browser archive (IndexedDB): restores
 * them once on mount, then saves changes shortly after they happen and
 * removes pages the user deleted. If the archive is unavailable the panel
 * simply keeps working in memory, as it did before.
 */
export function useArchiveSync(
  side: ArchivedPage["side"],
  copies: Copy[],
  restore: (restored: Copy[]) => void
) {
  const ready = useRef(false);
  const signatures = useRef(new Map<string, string>());
  const blobs = useRef(new Map<string, Blob>());
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    let alive = true;
    archive
      .loadAll()
      .then((all) => {
        if (!alive) return;
        const mine = all.filter((p) => p.side === side);
        if (mine.length) {
          const restored = mine.map(archivedToCopy);
          restored.forEach((c, i) => {
            signatures.current.set(c.id, copySignature(c));
            if (c.imageUrl && mine[i].image) blobs.current.set(c.imageUrl, mine[i].image!);
          });
          restoreRef.current(restored);
        }
        ready.current = true;
      })
      .catch(() => {
        /* archive unavailable: stay in-memory, never block the panel */
      });
    return () => {
      alive = false;
    };
  }, [side]);

  useEffect(() => {
    if (!ready.current) return;
    const timer = setTimeout(async () => {
      try {
        const present = new Set<string>();
        for (const c of copies) {
          if (!hasContent(c)) continue;
          present.add(c.id);
          const sig = copySignature(c);
          if (signatures.current.get(c.id) === sig) continue;
          let image: Blob | null = null;
          if (c.imageUrl) {
            image = blobs.current.get(c.imageUrl) ?? (await (await fetch(c.imageUrl)).blob());
            blobs.current.set(c.imageUrl, image);
          }
          await archive.save({
            id: c.id,
            side,
            label: c.label,
            orderKey: c.orderKey,
            fileName: c.fileName,
            image,
            transcript: c.transcript,
            approved: c.approved,
            notes: c.notes,
            updatedAt: Date.now(),
          });
          signatures.current.set(c.id, sig);
        }
        for (const id of [...signatures.current.keys()]) {
          if (!present.has(id)) {
            await archive.remove(id);
            signatures.current.delete(id);
          }
        }
      } catch {
        /* a failed save is retried on the next change */
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [copies, side]);
}
