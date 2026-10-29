import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  endSessionSchema,
  isSessionId,
  sessionIdSchema,
  uploadRequestSchema,
} from "./schemas";
import { MAX_CHAT_MESSAGES, MAX_PDF_BYTES } from "./limits";

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";

function pages(...texts: string[]) {
  return texts.map((text, index) => ({ page: index + 1, text }));
}

function validUpload() {
  return {
    filename: "synthetic-report.pdf",
    fileSize: 1_400,
    pageCount: 2,
    pages: pages("A".repeat(120), "B".repeat(120)),
  };
}

describe("sessionIdSchema", () => {
  it("accepts a generated UUID and trims surrounding whitespace", () => {
    expect(sessionIdSchema.parse(`  ${SESSION_ID}  `)).toBe(SESSION_ID);
    expect(isSessionId(SESSION_ID)).toBe(true);
  });

  it("rejects non-UUID and malformed UUID values", () => {
    for (const value of [
      "",
      "not-a-session",
      "123e4567-e89b-02d3-a456-426614174000",
      "123e4567-e89b-42d3-7456-426614174000",
      "123e4567-e89b-42d3-a456-42661417400",
    ]) {
      expect(sessionIdSchema.safeParse(value).success).toBe(false);
      expect(isSessionId(value)).toBe(false);
    }
  });
});

describe("uploadRequestSchema", () => {
  it("accepts a valid two-page payload", () => {
    const result = uploadRequestSchema.safeParse(validUpload());
    expect(result.success).toBe(true);
  });

  it("rejects a page count that does not match the pages array", () => {
    const result = uploadRequestSchema.safeParse({
      ...validUpload(),
      pageCount: 3,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-sequential page numbers", () => {
    const payload = validUpload();
    payload.pages = [
      { page: 1, text: "A".repeat(120) },
      { page: 3, text: "B".repeat(120) },
    ];
    const result = uploadRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects extracted text below the minimum", () => {
    const result = uploadRequestSchema.safeParse({
      ...validUpload(),
      pages: pages("A".repeat(99), "B".repeat(100)),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a report above the total text cap", () => {
    const oversizedPages = Array.from({ length: 11 }, (_, index) => ({
      page: index + 1,
      text: "A".repeat(100_000),
    }));
    const result = uploadRequestSchema.safeParse({
      filename: "large.pdf",
      fileSize: 1_000,
      pageCount: oversizedPages.length,
      pages: oversizedPages,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-PDF filename and oversized file size", () => {
    expect(
      uploadRequestSchema.safeParse({
        ...validUpload(),
        filename: "report.txt",
      }).success,
    ).toBe(false);

    expect(
      uploadRequestSchema.safeParse({
        ...validUpload(),
        fileSize: MAX_PDF_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects more than the page limit", () => {
    const tooMany = Array.from({ length: 31 }, (_, index) => ({
      page: index + 1,
      text: "A".repeat(10),
    }));
    const result = uploadRequestSchema.safeParse({
      filename: "report.pdf",
      fileSize: 1_000,
      pageCount: tooMany.length,
      pages: tooMany,
    });
    expect(result.success).toBe(false);
  });
});

describe("chat and end-session schemas", () => {
  it("bounds the chat message array", () => {
    expect(
      chatRequestSchema.safeParse({ messages: [{ role: "user" }] }).success,
    ).toBe(true);

    expect(
      chatRequestSchema.safeParse({
        messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => ({
          role: "user",
        })),
      }).success,
    ).toBe(false);
  });

  it("validates the end-session body", () => {
    expect(endSessionSchema.safeParse({ sessionId: SESSION_ID }).success).toBe(
      true,
    );
    expect(endSessionSchema.safeParse({ sessionId: "nope" }).success).toBe(
      false,
    );
  });
});
