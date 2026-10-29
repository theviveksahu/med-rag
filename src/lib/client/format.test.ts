import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatShortDuration,
  middleEllipsis,
} from "./format";

describe("formatBytes", () => {
  it("formats zero and small values", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-1)).toBe("0 KB");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes and megabytes", () => {
    expect(formatBytes(1_400)).toBe("1.4 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("formatDuration", () => {
  it("formats elapsed time as minutes and seconds", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(61_000)).toBe("01:01");
    expect(formatDuration(-10)).toBe("00:00");
  });
});

describe("formatShortDuration", () => {
  it("uses one decimal below ten seconds", () => {
    expect(formatShortDuration(1_200)).toBe("1.2s");
    expect(formatShortDuration(8_400)).toBe("8.4s");
  });

  it("rounds seconds and falls back to clock format", () => {
    expect(formatShortDuration(12_400)).toBe("12s");
    expect(formatShortDuration(72_000)).toBe("01:12");
  });
});

describe("middleEllipsis", () => {
  it("leaves short values unchanged", () => {
    expect(middleEllipsis("report.pdf", 20)).toBe("report.pdf");
  });

  it("keeps both ends and stays within the limit", () => {
    const result = middleEllipsis("synthetic-medical-report-2026.pdf", 18);
    expect(result).toContain("…");
    expect(result.startsWith("synthet")).toBe(true);
    expect(result.endsWith(".pdf")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(18);
  });
});
