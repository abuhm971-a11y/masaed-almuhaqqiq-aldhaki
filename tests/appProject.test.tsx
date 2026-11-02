import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { archive } from "../src/lib/archiveStore";
import { buildProjectFile } from "../src/lib/projectFile";

const urlBlobs = new Map<string, Blob>();
let n = 0;
beforeEach(async () => {
  vi.stubGlobal("Blob", NodeBlob);
  urlBlobs.clear();
  await archive.clear();
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => {
    const u = `blob:t/${++n}`;
    urlBlobs.set(u, b);
    return u;
  };
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  vi.stubGlobal("fetch", async (u: string) => ({ blob: async () => urlBlobs.get(u)! }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const doc = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "نص التحقيق" }] }] };
const projectWithPages = (pages: unknown[]) =>
  buildProjectFile(doc, [], [], pages as never);

async function openFile(json: string) {
  const input = document.querySelector('input[accept=".json,application/json"]') as HTMLInputElement;
  const file = new File([json], "p.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => json });
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
}

describe("opening a project that carries pages", () => {
  it("replaces the archive and both panels show the file's pages", async () => {
    await archive.save({ id: "old", side: "manuscript", label: "أ", orderKey: 1, fileName: null, image: null, transcript: "قديم", approved: false, notes: [], updatedAt: 0 });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    await openFile(projectWithPages([
      { id: "p1", side: "manuscript", label: "أ", orderKey: 1, fileName: "p1.png", transcript: "من الملف", approved: true, notes: [], imageDataUrl: "data:image/png;base64,AAAA" },
    ]));
    await waitFor(async () => expect((await archive.loadAll()).map((p) => p.id)).toEqual(["p1"]));
    await waitFor(() => expect(screen.getByDisplayValue("من الملف")).toBeTruthy());
  });

  it("declining the replacement changes nothing", async () => {
    await archive.save({ id: "old", side: "manuscript", label: "أ", orderKey: 1, fileName: null, image: null, transcript: "قديم", approved: false, notes: [], updatedAt: 0 });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    await openFile(projectWithPages([{ id: "p1", side: "manuscript", label: "أ", orderKey: 1, transcript: "x" }]));
    expect((await archive.loadAll()).map((p) => p.id)).toEqual(["old"]);
  });

  it("an older file without pages leaves the researcher's pages alone and asks nothing about them", async () => {
    await archive.save({ id: "old", side: "manuscript", label: "أ", orderKey: 1, fileName: null, image: null, transcript: "قديم", approved: false, notes: [], updatedAt: 0 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    await openFile(buildProjectFile(doc, [], []));
    expect((await archive.loadAll()).map((p) => p.id)).toEqual(["old"]);
    const pageQuestions = confirm.mock.calls.filter(([m]) => String(m).includes("أرشيف الصفحات"));
    expect(pageQuestions).toHaveLength(0);
  });
});

describe("saving a project", () => {
  const savedProject = async () => {
    const created = Array.from(urlBlobs.values()).filter((b) => b.type.startsWith("application/json"));
    return JSON.parse(await created[created.length - 1].text());
  };
  const seed = () => archive.save({
    id: "p1", side: "manuscript", label: "أ", orderKey: 1, fileName: "p1.png",
    image: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    transcript: "نص الصفحة", approved: true, notes: [], updatedAt: 0,
  });

  it("includes the page archive with images by default", async () => {
    await seed();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    await act(async () => { fireEvent.click(screen.getByText("حفظ المشروع")); await new Promise((r) => setTimeout(r, 1200)); });
    const saved = await savedProject();
    expect(saved.pages).toHaveLength(1);
    expect(saved.pages[0]).toMatchObject({ id: "p1", transcript: "نص الصفحة", approved: true });
    expect(saved.pages[0].imageDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("leaves the images out when 'مع صور الصفحات' is unticked, keeping the texts", async () => {
    await seed();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    fireEvent.click(screen.getByLabelText("مع صور الصفحات"));
    await act(async () => { fireEvent.click(screen.getByText("حفظ المشروع")); await new Promise((r) => setTimeout(r, 1200)); });
    const saved = await savedProject();
    expect(saved.pages[0].imageDataUrl).toBeNull();
    expect(saved.pages[0].transcript).toBe("نص الصفحة");
  });

  it("with no pages at all the file keeps its old shape (no pages key)", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<App />);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    await act(async () => { fireEvent.click(screen.getByText("حفظ المشروع")); await new Promise((r) => setTimeout(r, 1200)); });
    expect("pages" in (await savedProject())).toBe(false);
  });
});
