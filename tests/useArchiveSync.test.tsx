import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { archive } from "../src/lib/archiveStore";
import { makeEmptyCopy } from "../src/lib/copies";
import { useArchiveSync } from "../src/lib/useArchiveSync";
import type { Copy } from "../src/types";

// jsdom has no blob: URLs; map them to real Blobs so the hook's own logic runs unmodified.
const urlBlobs = new Map<string, Blob>();
let n = 0;
beforeEach(async () => {
  // jsdom's Blob is a different realm from the one fake-indexeddb clones; use Node's so the
  // stored bytes survive exactly as they do in a real browser.
  vi.stubGlobal("Blob", NodeBlob);
  urlBlobs.clear();
  await archive.clear();
  vi.stubGlobal("fetch", async (u: string) => ({ blob: async () => urlBlobs.get(u)! }));
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
    const u = `blob:test/${++n}`;
    urlBlobs.set(u, b);
    return u;
  };
});

/** Simulates one panel session: the same wiring SidePanel uses. */
function usePanel(side: "manuscript" | "printed") {
  const [copies, setCopies] = useState<Copy[]>([makeEmptyCopy("أ", 1)]);
  useArchiveSync(side, copies, (restored) => setCopies(restored));
  return { copies, setCopies };
}

const settle = () => new Promise((r) => setTimeout(r, 900)); // > 500 ms debounce

describe("page archive across a reload", () => {
  it("a page with image, transcript and approval survives a reload", async () => {
    const first = renderHook(() => usePanel("manuscript"));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); // let the initial load finish

    const blob = new Blob(["scan"], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    act(() => {
      first.result.current.setCopies((c) => [
        { ...c[0], imageUrl: url, fileName: "p1.png", transcript: "بسم الله", approved: true },
      ]);
    });
    await act(settle);
    first.unmount(); // "reload"

    const second = renderHook(() => usePanel("manuscript"));
    await waitFor(() => expect(second.result.current.copies[0].transcript).toBe("بسم الله"));
    const c = second.result.current.copies[0];
    expect(c.approved).toBe(true);
    expect(c.fileName).toBe("p1.png");
    expect(await urlBlobs.get(c.imageUrl!)!.text()).toBe("scan");
  });

  it("the two panels never see each other's pages", async () => {
    const m = renderHook(() => usePanel("manuscript"));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    act(() => m.result.current.setCopies((c) => [{ ...c[0], transcript: "مخطوط" }]));
    await act(settle);
    m.unmount();

    const p = renderHook(() => usePanel("printed"));
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(p.result.current.copies[0].transcript).toBe(""); // untouched placeholder
  });

  it("a deleted page is removed from the archive", async () => {
    const h = renderHook(() => usePanel("manuscript"));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    act(() => h.result.current.setCopies((c) => [{ ...c[0], transcript: "x" }]));
    await act(settle);
    expect((await archive.loadAll()).length).toBe(1);
    act(() => h.result.current.setCopies(() => []));
    await act(settle);
    expect((await archive.loadAll()).length).toBe(0);
  });

  it("an empty placeholder tab is never written to the archive", async () => {
    renderHook(() => usePanel("manuscript"));
    await act(settle);
    expect(await archive.loadAll()).toEqual([]);
  });

  it("unchanged pages are not rewritten when another page changes", async () => {
    const h = renderHook(() => usePanel("manuscript"));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    act(() =>
      h.result.current.setCopies(() => [
        { ...makeEmptyCopy("أ", 1), id: "a", transcript: "الأولى" },
        { ...makeEmptyCopy("ب", 2), id: "b", transcript: "الثانية" },
      ])
    );
    await act(settle);
    const spy = vi.spyOn(archive, "save");
    act(() => h.result.current.setCopies((c) => c.map((x) => (x.id === "b" ? { ...x, transcript: "عُدّلت" } : x))));
    await act(settle);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe("b");
  });
});
