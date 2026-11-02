import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceBankPanel } from "../src/components/ReferenceBankPanel";
import type { ReferenceCard } from "../src/types";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const hadith: ReferenceCard = {
  id: "h", category: "hadith", title: "صحيح البخاري", author: "البخاري",
  details: "كتاب الإيمان، حديث 1", excerpt: "إنما الأعمال بالنيات",
};
const rijal: ReferenceCard = {
  id: "r", category: "rijal", title: "تهذيب الكمال", author: "المزي",
  details: "ج1 ص5", excerpt: "ترجمة",
};

const mount = () => {
  const view = render(
    <ReferenceBankPanel
      cards={[hadith, rijal]}
      onAddCard={() => {}}
      onDeleteCard={() => {}}
      onInsertFootnote={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("بنك المراجع"));
  return view;
};
const previewText = () => document.querySelector('[aria-live="polite"]')!.textContent!;
const selects = () => Array.from(document.querySelectorAll("select"));
/** The per-type style section is the grid that follows the toggle button. */
const styleSelect = (label: string) => {
  const grid = screen.getByText("إخفاء أسلوب الأنواع").closest("div")!.nextElementSibling as HTMLElement;
  const row = Array.from(grid.querySelectorAll("label")).find((l) => l.querySelector("span")!.textContent === label)!;
  return row.querySelector("select") as HTMLSelectElement;
};

describe("per-type documentation style", () => {
  it("a type set to 'with author and excerpt' changes only that type's citation", () => {
    mount();
    fireEvent.click(screen.getByText("ضبط الأسلوب لكل نوع"));
    fireEvent.change(styleSelect("حديث"), { target: { value: "full" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // hadith card
    expect(previewText()).toContain("البخاري");
    expect(previewText()).toContain("«إنما الأعمال بالنيات»");
    fireEvent.click(screen.getAllByRole("checkbox")[0]); // untick
    fireEvent.click(screen.getAllByRole("checkbox")[1]); // rijal card
    expect(previewText()).not.toContain("المزي");
    expect(previewText()).not.toContain("«ترجمة»");
  });

  it("different types in one citation each follow their own style", () => {
    mount();
    fireEvent.click(screen.getByText("ضبط الأسلوب لكل نوع"));
    fireEvent.change(styleSelect("رجال ورواة"), { target: { value: "excerpt" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(previewText()).toContain("«ترجمة»");
    expect(previewText()).not.toContain("«إنما");
  });

  it("the choice survives remounting (same browser)", () => {
    const first = mount();
    fireEvent.click(screen.getByText("ضبط الأسلوب لكل نوع"));
    fireEvent.change(styleSelect("حديث"), { target: { value: "author" } });
    first.unmount();
    mount();
    fireEvent.click(screen.getByText("ضبط الأسلوب لكل نوع"));
    expect(styleSelect("حديث").value).toBe("author");
  });

  it("with nothing configured the output is exactly what it was before", () => {
    mount();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(previewText()).toBe("أخرجه صحيح البخاري، كتاب الإيمان، حديث 1.");
  });

  it("a damaged saved value is ignored instead of breaking the panel", () => {
    localStorage.setItem("masaed-citation-styles", "{broken");
    mount();
    fireEvent.click(screen.getByText("ضبط الأسلوب لكل نوع"));
    expect(styleSelect("حديث").value).toBe("default");
    expect(selects().length).toBeGreaterThan(0);
  });
});
