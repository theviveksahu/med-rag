import { describe, expect, it } from "vitest";
import {
  hashNormalizedReport,
  prepareChunks,
  prepareReport,
  sanitizeFilename,
} from "./ingest";
import { MAX_REPORT_FILENAME_CHARS } from "@/lib/shared/limits";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const reportHash = "a".repeat(64);
const createdAt = new Date("2026-01-01T00:00:00Z");
const expiresAt = new Date("2026-01-02T00:00:00Z");

function chunkOptions(texts: string[]) {
  return {
    sessionId,
    reportHash,
    source: "synthetic-report.pdf",
    pages: texts.map((text, index) => ({ page: index + 1, text })),
    createdAt,
    expiresAt,
  };
}

describe("prepareReport", () => {
  it("hashes the normalized report deterministically", () => {
    const pages = [
      { page: 1, text: "  Glucose:  92 mg/dL  " },
      { page: 2, text: "Hemoglobin: 13.8 g/dL" },
    ];
    const first = prepareReport(pages);
    const second = prepareReport(pages);

    expect(first.reportHash).toBe(second.reportHash);
    expect(first.reportHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.normalizedText).toBe(
      "--- page 1 ---\nGlucose: 92 mg/dL\n\n--- page 2 ---\nHemoglobin: 13.8 g/dL",
    );
    expect(hashNormalizedReport(first.normalizedText)).toBe(first.reportHash);
  });

  it("changes the hash when page boundaries move", () => {
    const first = prepareReport([
      { page: 1, text: "Alpha" },
      { page: 2, text: "Beta" },
    ]);
    const second = prepareReport([
      { page: 1, text: "AlphaBeta" },
    ]);

    expect(first.reportHash).not.toBe(second.reportHash);
  });
});

describe("sanitizeFilename", () => {
  it("removes directories and control characters", () => {
    expect(sanitizeFilename("../../secret.pdf")).toBe("secret.pdf");
    expect(sanitizeFilename("..\\..\\secret.pdf")).toBe("secret.pdf");
    expect(sanitizeFilename("report\u0000\u001f.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("  my   report.pdf  ")).toBe("my report.pdf");
  });

  it("falls back to a deterministic name", () => {
    expect(sanitizeFilename("")).toBe("report.pdf");
    expect(sanitizeFilename("   ")).toBe("report.pdf");
  });

  it("caps a long filename without losing the PDF extension", () => {
    const result = sanitizeFilename(`${"a".repeat(400)}.pdf`);
    expect(result.length).toBeLessThanOrEqual(MAX_REPORT_FILENAME_CHARS);
    expect(result.endsWith(".pdf")).toBe(true);
  });
});

describe("prepareChunks", () => {
  it("keeps 1-based page numbers and a global chunk index", async () => {
    const chunks = await prepareChunks(
      chunkOptions(["A".repeat(2_500), "B".repeat(2_500)]),
    );

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]?.metadata.page).toBe(1);
    expect(chunks.at(-1)?.metadata.page).toBe(2);
    expect(chunks.map((chunk) => chunk.metadata.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );

    for (const chunk of chunks) {
      expect(chunk.metadata).toMatchObject({
        sessionId,
        reportHash,
        source: "synthetic-report.pdf",
        createdAt,
        expiresAt,
      });
      expect(chunk.pageContent.trim()).toBe(chunk.pageContent);
    }
  });

  it("skips blank pages while preserving the page number", async () => {
    const chunks = await prepareChunks(
      chunkOptions(["   \n\t ", "Valid synthetic text ".repeat(12)]),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.metadata.page).toBe(2);
    expect(chunks[0]?.metadata.chunkIndex).toBe(0);
  });

  it("rejects a report with no extractable text", async () => {
    await expect(
      prepareChunks(chunkOptions(["   ", "\n\n"])),
    ).rejects.toMatchObject({ code: "EMPTY_REPORT" });
  });

  it("enforces the 200-chunk cap", async () => {
    const pages = Array.from({ length: 20 }, () =>
      "The report contains a synthetic value. ".repeat(350),
    );

    await expect(prepareChunks(chunkOptions(pages))).rejects.toMatchObject({
      code: "REPORT_TOO_LARGE",
    });
  });
});
