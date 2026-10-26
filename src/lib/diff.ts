export type DiffOp = { type: "equal" | "add" | "remove"; text: string };

/** Standard word-level LCS diff. Splits on whitespace (keeping the
 * whitespace tokens so spacing is preserved), builds the LCS table, then
 * backtracks to produce a sequence of equal/add/remove operations. */
export function diffWords(a: string, b: string): DiffOp[] {
  const aw = a.split(/(\s+)/).filter((t) => t.length > 0);
  const bw = b.split(/(\s+)/).filter((t) => t.length > 0);
  const n = aw.length;
  const m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) {
      ops.push({ type: "equal", text: aw[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: aw[i] });
      i++;
    } else {
      ops.push({ type: "add", text: bw[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", text: aw[i++] });
  while (j < m) ops.push({ type: "add", text: bw[j++] });
  return ops;
}

/** Groups raw diff ops into runs, merging consecutive add/remove ops into
 * one chunk (so a replaced phrase becomes a single "convert to footnote"
 * unit instead of one button per word). */
export function groupDiffOps(ops: DiffOp[]): { equal?: string; removed?: string; added?: string }[] {
  const groups: { equal?: string; removed?: string; added?: string }[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === "equal") {
      let text = "";
      while (i < ops.length && ops[i].type === "equal") text += ops[i++].text;
      groups.push({ equal: text });
    } else {
      let removed = "";
      let added = "";
      while (i < ops.length && ops[i].type !== "equal") {
        if (ops[i].type === "remove") removed += ops[i].text;
        else added += ops[i].text;
        i++;
      }
      groups.push({ removed: removed.trim(), added: added.trim() });
    }
  }
  return groups;
}
