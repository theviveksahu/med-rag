import { describe, expect, it } from "vitest";
import { normalizeExtractedText, normalizeReport } from "./text";

describe("normalizeExtractedText", () => {
  it("normalizes newlines and horizontal whitespace without losing lines", () => {
    expect(
      normalizeExtractedText("  Hemoglobin:  13.8 g/dL \r\n\tReference: 12.0–16.0  "),
    ).toBe("Hemoglobin: 13.8 g/dL\nReference: 12.0–16.0");
  });

  it("preserves medical punctuation and blank-line structure", () => {
    expect(normalizeExtractedText("A\n\nB\t\tC")).toBe("A\n\nB C");
  });
});

describe("normalizeReport", () => {
  it("preserves page boundaries and normalizes each page", () => {
    expect(
      normalizeReport([
        { page: 1, text: "  First   page  " },
        { page: 2, text: "Second\tpage" },
      ]),
    ).toBe("--- page 1 ---\nFirst page\n\n--- page 2 ---\nSecond page");
  });

  it("is deterministic for identical input", () => {
    const pages = [
      { page: 1, text: "Glucose: 92 mg/dL" },
      { page: 2, text: "Hemoglobin: 13.8 g/dL" },
    ];

    expect(normalizeReport(pages)).toBe(normalizeReport(pages));
  });

  it("changes when page order changes", () => {
    const first = normalizeReport([
      { page: 1, text: "Alpha" },
      { page: 2, text: "Beta" },
    ]);
    const second = normalizeReport([
      { page: 1, text: "Beta" },
      { page: 2, text: "Alpha" },
    ]);

    expect(first).not.toBe(second);
  });
});
