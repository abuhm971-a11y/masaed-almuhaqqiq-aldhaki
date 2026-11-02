import { describe, expect, it } from "vitest";
import {
  assembleApproved,
  buildMergePreview,
  findOrderCollisions,
  splitOrderKey,
} from "../src/lib/pageOrder";
import type { RegisteredCopy } from "../src/types";

const page = (
  id: string,
  orderKey: number,
  status: RegisteredCopy["status"],
  transcript = "",
  side: RegisteredCopy["side"] = "manuscript"
): RegisteredCopy => ({ id, side, label: id, orderKey, status, transcript });

describe("splitOrderKey", () => {
  it("documents the old defect: key+0.5 collides on a second split", () => {
    const keys = [1, 1.5, 2];
    expect(1.5 + 0.5).toBe(2); // old formula puts the new page ON page 2
    expect(keys).toContain(1.5 + 0.5);
  });

  it("first split of a page keeps the historical n.5 result", () => {
    expect(splitOrderKey(1, [1, 2, 3])).toBe(1.5);
  });

  it("splitting an already-split page lands strictly between neighbours", () => {
    const k = splitOrderKey(1.5, [1, 1.5, 2]);
    expect(k).toBeGreaterThan(1.5);
    expect(k).toBeLessThan(2);
    expect(k).toBe(1.75);
  });

  it("splitting the first half again lands between it and its sibling", () => {
    expect(splitOrderKey(1, [1, 1.5, 2])).toBe(1.25);
  });

  it("last page: follows by 0.5", () => {
    expect(splitOrderKey(3, [1, 2, 3])).toBe(3.5);
  });

  it("20 successive splits never collide and stay strictly ordered", () => {
    let keys = [1, 2];
    for (let i = 0; i < 20; i++) {
      const k = splitOrderKey(1, keys);
      expect(keys).not.toContain(k);
      expect(k).toBeGreaterThan(1);
      expect(k).toBeLessThan(Math.min(...keys.filter((x) => x > 1)));
      keys = [...keys, k];
    }
  });
});

describe("merge preview", () => {
  const pages = [
    page("b", 2, "approved", "  ثم قال الشيخ ورحمه الله  "),
    page("a", 1, "approved", "بسم الله الرحمن الرحيم"),
    page("c", 1.5, "draft", "مسودة لم تعتمد"),
    page("d", 3, "not_transcribed"),
  ];

  it("orders by orderKey and flags every non-approved page as a gap", () => {
    const rows = buildMergePreview(pages);
    expect(rows.map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
    expect(rows.map((r) => r.isGap)).toEqual([false, true, false, true]);
  });

  it("reports first and last words of approved pages only", () => {
    const rows = buildMergePreview(pages);
    expect(rows[0].firstWord).toBe("بسم");
    expect(rows[0].lastWord).toBe("الرحيم");
    expect(rows[1].firstWord).toBe(""); // draft: nothing claimed
  });

  it("assembles approved text only, in order, never a draft", () => {
    expect(assembleApproved(pages)).toBe(
      "بسم الله الرحمن الرحيم\n\nثم قال الشيخ ورحمه الله"
    );
  });

  it("empty input produces empty output without throwing", () => {
    expect(buildMergePreview([])).toEqual([]);
    expect(assembleApproved([])).toBe("");
  });

  it("detects pages sharing a position on the same side", () => {
    expect(
      findOrderCollisions([
        page("x", 2, "approved", "a"),
        page("y", 2, "approved", "b"),
        page("z", 2, "approved", "c", "printed"),
      ])
    ).toEqual([2]);
  });
});
