import type { RegisteredCopy } from "../types";

const PRECISION = 1e9;
const round = (n: number) => Math.round(n * PRECISION) / PRECISION;

/**
 * Position for the page created by splitting the page at `key`.
 * It is the midpoint between `key` and the next greater key in the same
 * panel, so it can never collide with an existing page — even when an
 * already-split page (e.g. 1.5) is split again. When `key` is the last
 * page, the new page simply follows it by 0.5 (the historical behaviour).
 */
export function splitOrderKey(key: number, allKeys: readonly number[]): number {
  const greater = allKeys.filter((k) => k > key);
  if (greater.length === 0) return round(key + 0.5);
  return round((key + Math.min(...greater)) / 2);
}

export type MergeRow = {
  id: string;
  side: RegisteredCopy["side"];
  label: string;
  orderKey: number;
  status: RegisteredCopy["status"];
  /** First and last words of the approved transcript — what the
   * researcher checks at page joins to confirm the sequence is right. */
  firstWord: string;
  lastWord: string;
  isGap: boolean;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Ordered preview rows (side, then orderKey). Same order the merge tool
 * has always used; adds first/last words for join checking. */
export function buildMergePreview(copies: readonly RegisteredCopy[]): MergeRow[] {
  return [...copies]
    .sort((a, b) =>
      a.side === b.side ? a.orderKey - b.orderKey : a.side.localeCompare(b.side)
    )
    .map((c) => {
      const w = c.status === "approved" ? words(c.transcript) : [];
      return {
        id: c.id,
        side: c.side,
        label: c.label,
        orderKey: c.orderKey,
        status: c.status,
        firstWord: w[0] ?? "",
        lastWord: w[w.length - 1] ?? "",
        isGap: c.status !== "approved",
      };
    });
}

/** Text of the approved pages only, in preview order. Never includes a
 * draft or untranscribed page. */
export function assembleApproved(copies: readonly RegisteredCopy[]): string {
  const rows = buildMergePreview(copies);
  const byId = new Map(copies.map((c) => [c.id, c]));
  return rows
    .filter((r) => !r.isGap)
    .map((r) => byId.get(r.id)!.transcript.trim())
    .join("\n\n");
}

/** Pages that share an orderKey on the same side — an ordering fault the
 * preview should surface instead of silently interleaving. */
export function findOrderCollisions(copies: readonly RegisteredCopy[]): number[] {
  const seen = new Map<string, number>();
  const bad = new Set<number>();
  for (const c of copies) {
    const k = `${c.side}|${c.orderKey}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    if ((seen.get(k) ?? 0) > 1) bad.add(c.orderKey);
  }
  return [...bad].sort((a, b) => a - b);
}
