import { describe, expect, it } from "vitest";
import { parseStyles, presetKeyOf, setTypeStyle } from "../src/lib/citationStyles";

describe("citation styles per type", () => {
  it("setting a preset stores that type's style only", () => {
    const m = setTypeStyle({}, "hadith", "full");
    expect(m).toEqual({ hadith: { includeAuthor: true, includeExcerpt: true } });
    expect(m.rijal).toBeUndefined();
  });
  it("'default' removes the entry so the type follows the general options again", () => {
    const m = setTypeStyle({ hadith: { includeAuthor: true, includeExcerpt: true } }, "hadith", "default");
    expect(m).toEqual({});
  });
  it("does not mutate the previous map", () => {
    const before = { rijal: { includeAuthor: false, includeExcerpt: true } };
    setTypeStyle(before, "rijal", "author");
    expect(before).toEqual({ rijal: { includeAuthor: false, includeExcerpt: true } });
  });
  it("presetKeyOf round-trips every preset", () => {
    for (const k of ["location", "author", "excerpt", "full"]) {
      expect(presetKeyOf(setTypeStyle({}, "fiqh", k).fiqh)).toBe(k);
    }
    expect(presetKeyOf(undefined)).toBe("default");
  });
  it("an unknown preset leaves the type on the default", () => {
    expect(setTypeStyle({}, "lugha", "nonsense")).toEqual({});
  });
});

describe("parseStyles (saved value is untrusted)", () => {
  it("restores a valid map", () => {
    const raw = JSON.stringify({ hadith: { includeAuthor: true, includeExcerpt: false } });
    expect(parseStyles(raw)).toEqual({ hadith: { includeAuthor: true, includeExcerpt: false } });
  });
  it("ignores junk, wrong types and unknown categories without throwing", () => {
    expect(parseStyles(null)).toEqual({});
    expect(parseStyles("{not json")).toEqual({});
    expect(parseStyles("42")).toEqual({});
    expect(parseStyles(JSON.stringify({ hadith: { includeAuthor: "yes" }, bogus: { includeAuthor: true, includeExcerpt: true } }))).toEqual({});
  });
});
