import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FootnotesPanel } from "../src/components/FootnotesPanel";
import { ReferenceBankPanel } from "../src/components/ReferenceBankPanel";
import type { FootnoteEntry, ReferenceCard } from "../src/types";

afterEach(cleanup);

const card: ReferenceCard = {
  id: "c1",
  category: "hadith",
  title: "صحيح البخاري",
  author: "البخاري",
  details: "كتاب الإيمان، حديث 1",
  excerpt: "إنما الأعمال بالنيات",
};
const note: FootnoteEntry = { id: "fn1", category: "takhrij", index: 2, text: "", includeInPrint: true };
const EXPECTED = "أخرجه صحيح البخاري، كتاب الإيمان، حديث 1.";

function setup(active: FootnoteEntry | null) {
  const onInsertFootnote = vi.fn();
  const onAppendToFootnote = vi.fn();
  render(
    <ReferenceBankPanel
      cards={[card]}
      onAddCard={() => {}}
      onDeleteCard={() => {}}
      onInsertFootnote={onInsertFootnote}
      activeFootnote={active}
      onAppendToFootnote={onAppendToFootnote}
    />
  );
  fireEvent.click(screen.getByText("بنك المراجع")); // open the panel
  return { onInsertFootnote, onAppendToFootnote };
}
const tick = () => fireEvent.click(screen.getAllByRole("checkbox")[0]);

describe("reference bank → selected footnote", () => {
  it("offers no append button when no footnote is selected", () => {
    setup(null);
    tick();
    expect(screen.queryByText(/إلحاق بالحاشية المحددة/)).toBeNull();
    expect(screen.getByText("إدراج الحاشية عند المؤشر")).toBeTruthy();
  });

  it("append button is disabled until a card is ticked, then sends the citation to that footnote", () => {
    const { onAppendToFootnote, onInsertFootnote } = setup(note);
    const btn = screen.getByText(/إلحاق بالحاشية المحددة/).closest("button")!;
    expect(btn.disabled).toBe(true);
    tick();
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAppendToFootnote).toHaveBeenCalledTimes(1);
    expect(onAppendToFootnote).toHaveBeenCalledWith("fn1", EXPECTED);
    expect(onInsertFootnote).not.toHaveBeenCalled(); // no extra marker created
  });

  it("names the target footnote on the button so the researcher can see where it goes", () => {
    setup(note);
    expect(screen.getByText(/إلحاق بالحاشية المحددة/).textContent).toContain("2");
  });

  it("clears the ticked card after appending", () => {
    setup(note);
    tick();
    fireEvent.click(screen.getByText(/إلحاق بالحاشية المحددة/).closest("button")!);
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(false);
  });

  it("the existing insert-at-cursor path is unchanged", () => {
    const { onInsertFootnote, onAppendToFootnote } = setup(note);
    tick();
    fireEvent.click(screen.getByText("إدراج الحاشية عند المؤشر"));
    expect(onInsertFootnote).toHaveBeenCalledWith("takhrij", EXPECTED);
    expect(onAppendToFootnote).not.toHaveBeenCalled();
  });
});

describe("footnotes panel selection", () => {
  it("touching a footnote's text box selects it; the selected one is highlighted", () => {
    const onFocusEntry = vi.fn();
    const { container } = render(
      <FootnotesPanel
        entries={[note, { ...note, id: "fn2", index: 3 }]}
        onInsert={() => {}}
        onChangeText={() => {}}
        onToggleInclude={() => {}}
        activeId="fn1"
        onFocusEntry={onFocusEntry}
      />
    );
    const boxes = container.querySelectorAll("textarea");
    fireEvent.focus(boxes[1]);
    expect(onFocusEntry).toHaveBeenCalledWith("fn2");
    expect(boxes[0].className).toContain("ring-2");
    expect(boxes[1].className).not.toContain("ring-2");
  });
});
