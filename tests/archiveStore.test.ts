import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { archive, sanitizePage, type ArchivedPage } from "../src/lib/archiveStore";

const DB = "test-archive";
const mk = (over: Partial<ArchivedPage> = {}): ArchivedPage => ({
  id: "p1",
  side: "manuscript",
  label: "أ",
  orderKey: 1,
  fileName: "p1.png",
  image: new Blob(["img-bytes"], { type: "image/png" }),
  transcript: "نص الصفحة",
  approved: true,
  notes: [],
  updatedAt: 0,
  ...over,
});

beforeEach(async () => {
  await archive.clear(DB);
});

describe("archive persistence", () => {
  it("round-trips a page including its image bytes", async () => {
    await archive.save(mk(), DB);
    const [p] = await archive.loadAll(DB);
    expect(p.transcript).toBe("نص الصفحة");
    expect(p.approved).toBe(true);
    expect(p.image).toBeInstanceOf(Blob);
    expect(await p.image!.text()).toBe("img-bytes");
  });

  it("returns pages in orderKey order, with split halves between neighbours", async () => {
    await archive.save(mk({ id: "c", orderKey: 2 }), DB);
    await archive.save(mk({ id: "a", orderKey: 1 }), DB);
    await archive.save(mk({ id: "b", orderKey: 1.5 }), DB);
    expect((await archive.loadAll(DB)).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("saving the same id updates instead of duplicating", async () => {
    await archive.save(mk({ transcript: "قبل" }), DB);
    await archive.save(mk({ transcript: "بعد" }), DB);
    const all = await archive.loadAll(DB);
    expect(all).toHaveLength(1);
    expect(all[0].transcript).toBe("بعد");
  });

  it("remove deletes only the targeted page", async () => {
    await archive.save(mk({ id: "a" }), DB);
    await archive.save(mk({ id: "b", orderKey: 2 }), DB);
    await archive.remove("a", DB);
    expect((await archive.loadAll(DB)).map((p) => p.id)).toEqual(["b"]);
  });

  it("an empty archive loads as an empty list", async () => {
    expect(await archive.loadAll(DB)).toEqual([]);
  });
});

describe("sanitizePage", () => {
  it("rejects malformed records", () => {
    expect(sanitizePage(null)).toBeNull();
    expect(sanitizePage({})).toBeNull();
    expect(sanitizePage({ id: "x", side: "other", orderKey: 1 })).toBeNull();
    expect(sanitizePage({ id: "x", side: "printed", orderKey: NaN })).toBeNull();
  });

  it("an approval without text is dropped (nothing to approve)", () => {
    const p = sanitizePage({ ...mk(), transcript: "   ", approved: true });
    expect(p?.approved).toBe(false);
  });

  it("fills safe defaults for missing optional fields", () => {
    const p = sanitizePage({ id: "x", side: "printed", orderKey: 3 });
    expect(p).toMatchObject({ label: "", fileName: null, image: null, transcript: "", notes: [] });
  });
});
