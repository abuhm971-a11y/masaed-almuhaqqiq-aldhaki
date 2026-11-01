import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { archive, type ArchivedPage } from "../src/lib/archiveStore";
import { buildProjectFile, parseProjectFile } from "../src/lib/projectFile";
import {
  blobToDataUrl, dataUrlToBlob, pagesToProject, projectToArchived, replaceArchive, sanitizeProjectPages,
} from "../src/lib/projectPages";

const DB = "test-project-pages";
const page = (id: string, over: Partial<ArchivedPage> = {}): ArchivedPage => ({
  id, side: "manuscript", label: "أ", orderKey: 1, fileName: `${id}.png`,
  image: new Blob([new Uint8Array([137, 80, 78, 71, 0, 255, 128])], { type: "image/png" }),
  transcript: "نص", approved: true, notes: [], updatedAt: 0, ...over,
});
const doc = { type: "doc" as const, content: [] };

beforeEach(async () => { await archive.clear(DB); });

describe("image encoding", () => {
  it("round-trips arbitrary bytes exactly (including 0x00 and 0xFF)", async () => {
    const original = new Uint8Array([0, 1, 2, 250, 255, 128, 137]);
    const url = await blobToDataUrl(new Blob([original], { type: "image/png" }));
    const back = dataUrlToBlob(url)!;
    expect(back.type).toBe("image/png");
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(original);
  });
  it("handles an image larger than one encoding chunk", async () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    const back = dataUrlToBlob(await blobToDataUrl(new Blob([big], { type: "image/jpeg" })))!;
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(big);
  });
  it("refuses anything that is not a base64 image data URL", () => {
    expect(dataUrlToBlob("data:text/html;base64,PGI+")).toBeNull();
    expect(dataUrlToBlob("javascript:alert(1)")).toBeNull();
    expect(dataUrlToBlob("data:image/png;base64,@@@")).toBeNull();
  });
});

describe("export", () => {
  it("includes images when asked, omits them (keeping everything else) when not", async () => {
    const withImg = await pagesToProject([page("a")], true);
    expect(withImg[0].imageDataUrl).toMatch(/^data:image\/png;base64,/);
    const without = await pagesToProject([page("a")], false);
    expect(without[0].imageDataUrl).toBeNull();
    expect(without[0]).toMatchObject({ transcript: "نص", approved: true, orderKey: 1, label: "أ" });
  });
});

describe("project file format", () => {
  it("a project saved without pages has no pages key (old shape unchanged)", () => {
    expect("pages" in JSON.parse(buildProjectFile(doc, [], []))).toBe(false);
  });
  it("opening an old file yields pages === undefined, so the archive is left alone", () => {
    expect(parseProjectFile(buildProjectFile(doc, [], [])).pages).toBeUndefined();
  });
  it("pages survive save → open, bytes included", async () => {
    const pages = await pagesToProject([page("a"), page("b", { orderKey: 1.5, side: "printed" })], true);
    const parsed = parseProjectFile(buildProjectFile(doc, [], [], pages));
    expect(parsed.pages).toHaveLength(2);
    const restored = projectToArchived(parsed.pages!);
    expect(new Uint8Array(await restored[0].image!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 0, 255, 128]));
    expect(restored[1]).toMatchObject({ id: "b", side: "printed", orderKey: 1.5 });
  });
  it("a hostile or damaged pages list is cleaned, never trusted", () => {
    const text = JSON.stringify({
      format: JSON.parse(buildProjectFile(doc, [], [])).format, version: 1, document: doc, footnotes: [], referenceCards: [],
      pages: [
        { id: "ok", side: "manuscript", orderKey: 1, transcript: "x", approved: true, imageDataUrl: "data:image/png;base64,AAAA" },
        { id: "ok", side: "manuscript", orderKey: 2 },
        { id: "evil", side: "manuscript", orderKey: 3, imageDataUrl: "data:text/html;base64,PHNjcmlwdD4=" },
        { id: "bad-side", side: "x", orderKey: 1 },
        { id: "no-key", side: "printed" },
        "junk", null, 7,
      ],
    });
    const pages = parseProjectFile(text).pages!;
    expect(pages.map((p) => p.id)).toEqual(["ok", "evil"]);
    expect(pages[0].imageDataUrl).toBe("data:image/png;base64,AAAA");
    expect(pages[1].imageDataUrl).toBeNull();
  });
});

describe("replaceArchive", () => {
  it("makes the archive equal to the file's pages: overwrites same ids, removes the rest", async () => {
    await archive.save(page("keep", { transcript: "قديم" }), DB);
    await archive.save(page("stale", { orderKey: 5 }), DB);
    await replaceArchive([page("keep", { transcript: "جديد" }), page("new", { orderKey: 2 })], DB);
    const all = await archive.loadAll(DB);
    expect(all.map((p) => p.id)).toEqual(["keep", "new"]);
    expect(all[0].transcript).toBe("جديد");
  });
  it("a failure while writing never removes the researcher's existing pages", async () => {
    await archive.save(page("mine"), DB);
    const poisoned = { ...page("boom"), image: (() => { throw new Error("x"); }) as unknown as Blob };
    await expect(replaceArchive([page("fine", { orderKey: 2 }), poisoned], DB)).rejects.toBeTruthy();
    expect((await archive.loadAll(DB)).map((p) => p.id)).toContain("mine");
  });
});
