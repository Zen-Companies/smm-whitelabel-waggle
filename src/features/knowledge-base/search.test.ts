import { describe, expect, it } from "vitest";
import { KB_SEARCH_MAX_WORDS, searchWords } from "./search";

describe("searchWords", () => {
  it("keeps letters and digits, drops filter syntax", () => {
    expect(searchWords("parking, (near) 7-Eleven?")).toEqual(["parking", "near", "Eleven"]);
    expect(searchWords("a,b.c%_*")).toEqual([]);
  });
  it("keeps non-English letters", () => {
    expect(searchWords("Kumusta ñ café")).toEqual(["Kumusta", "café"]);
  });
  it("caps the number of words; empty means no filter", () => {
    expect(searchWords("one two three four five six seven")).toHaveLength(KB_SEARCH_MAX_WORDS);
    expect(searchWords(undefined)).toEqual([]);
  });
});
