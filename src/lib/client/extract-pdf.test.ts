import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PAGE_CHARS, MAX_PDF_BYTES } from "@/lib/shared/limits";

const pdfjs = vi.hoisted(() => {
  class PasswordException extends Error {
    constructor() {
      super("Password required");
      this.name = "PasswordException";
    }
  }

  class InvalidPDFException extends Error {
    constructor() {
      super("Invalid PDF");
      this.name = "InvalidPDFException";
    }
  }

  class AbortException extends Error {
    constructor() {
      super("Aborted");
      this.name = "AbortException";
    }
  }

  return {
    getDocument: vi.fn(),
    GlobalWorkerOptions: { workerSrc: "" },
    PasswordException,
    InvalidPDFException,
    AbortException,
  };
});

vi.mock("pdfjs-dist", () => pdfjs);

import { extractPdf } from "./extract-pdf";

function makeFile(
  bytes = "%PDF-1.7\nsynthetic",
  name = "synthetic-report.pdf",
  type = "application/pdf",
): File {
  return new File([bytes], name, { type });
}

function mockPdf(pages: string[]) {
  const cleanup = vi.fn();
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: async () => ({
      items: [
        {
          str: pages[pageNumber - 1] ?? "",
          hasEOL: false,
        },
      ],
    }),
    cleanup,
  }));
  const destroy = vi.fn().mockResolvedValue(undefined);

  pdfjs.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage,
    }),
    destroy,
  } as never);

  return { getPage, destroy, cleanup };
}

beforeEach(() => {
  pdfjs.getDocument.mockReset();
  pdfjs.GlobalWorkerOptions.workerSrc = "";
});

describe("extractPdf", () => {
  it("extracts normalized text page by page and reports progress", async () => {
    const firstPage = `Synthetic Lab Report\n${"Hemoglobin: 13.8 g/dL. ".repeat(12)}`;
    const secondPage = `Metabolic Panel\n${"Glucose: 92 mg/dL. ".repeat(12)}`;
    const { destroy, cleanup } = mockPdf([firstPage, secondPage]);
    const progress = vi.fn();

    const result = await extractPdf(makeFile(), { onProgress: progress });

    expect(result.pageCount).toBe(2);
    expect(result.filename).toBe("synthetic-report.pdf");
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.page).toBe(1);
    expect(result.pages[1]?.page).toBe(2);
    expect(result.pages[0]?.text).toContain("Synthetic Lab Report");
    expect(result.pages[1]?.text).toContain("Metabolic Panel");
    expect(progress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(progress).toHaveBeenNthCalledWith(2, 2, 2);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(
      "/pdfjs/pdf.worker.min.mjs",
    );
  });

  it("rejects unsupported filenames, MIME types, and signatures", async () => {
    await expect(
      extractPdf(makeFile("%PDF-1.7", "report.txt", "application/pdf")),
    ).rejects.toMatchObject({ code: "PDF_UNSUPPORTED_TYPE" });

    await expect(
      extractPdf(makeFile("%PDF-1.7", "report.pdf", "text/plain")),
    ).rejects.toMatchObject({ code: "PDF_UNSUPPORTED_TYPE" });

    await expect(
      extractPdf(makeFile("not a pdf", "report.pdf")),
    ).rejects.toMatchObject({ code: "PDF_UNSUPPORTED_TYPE" });
  });

  it("rejects an oversized file before reading it", async () => {
    const file = makeFile();
    Object.defineProperty(file, "size", {
      configurable: true,
      value: MAX_PDF_BYTES + 1,
    });

    await expect(extractPdf(file)).rejects.toMatchObject({
      code: "PDF_TOO_LARGE",
    });
  });

  it("rejects a PDF with too many pages", async () => {
    const { getPage } = mockPdf(
      Array.from({ length: 31 }, (_, index) => `Page ${index + 1}`),
    );

    await expect(extractPdf(makeFile())).rejects.toMatchObject({
      code: "PDF_TOO_MANY_PAGES",
    });
    expect(getPage).not.toHaveBeenCalled();
  });

  it("rejects a scanned PDF with too little text", async () => {
    mockPdf(["short"]);

    await expect(extractPdf(makeFile())).rejects.toMatchObject({
      code: "PDF_SCANNED",
    });
  });

  it("rejects a page above the text cap", async () => {
    mockPdf(["A".repeat(MAX_PAGE_CHARS + 1)]);

    await expect(extractPdf(makeFile())).rejects.toMatchObject({
      code: "PDF_TEXT_TOO_LARGE",
    });
  });

  it("maps password-protected and invalid PDFs", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValueOnce({
      promise: Promise.reject(new pdfjs.PasswordException()),
      destroy,
    } as never);

    await expect(extractPdf(makeFile())).rejects.toMatchObject({
      code: "PDF_PASSWORD_PROTECTED",
    });

    pdfjs.getDocument.mockReturnValueOnce({
      promise: Promise.reject(new pdfjs.InvalidPDFException()),
      destroy,
    } as never);

    await expect(extractPdf(makeFile())).rejects.toMatchObject({
      code: "PDF_INVALID",
    });
  });

  it("honors an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      extractPdf(makeFile(), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "PDF_ABORTED" });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });
});
