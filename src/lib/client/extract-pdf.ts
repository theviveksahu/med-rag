import "client-only";

import {
  AppError,
  type ErrorCode,
  type ErrorOptions,
} from "@/lib/shared/errors";
import {
  MAX_PAGE_CHARS,
  MAX_PAGES,
  MAX_PDF_BYTES,
  MAX_TEXT_CHARS,
  MIN_TEXT_CHARS,
} from "@/lib/shared/limits";
import { normalizeExtractedText } from "@/lib/shared/text";

export { normalizeExtractedText } from "@/lib/shared/text";

export type PdfErrorCode = Extract<ErrorCode, `PDF_${string}`>;

export class PdfExtractionError extends AppError {
  constructor(code: PdfErrorCode, options: ErrorOptions = {}) {
    super(code, options);
    this.name = "PdfExtractionError";
  }
}

export interface ExtractedPage {
  page: number;
  text: string;
}

export interface ExtractedReport {
  filename: string;
  fileSize: number;
  pageCount: number;
  pages: ExtractedPage[];
}

export interface ExtractPdfOptions {
  signal?: AbortSignal;
  onProgress?: (page: number, total: number) => void;
}

type PdfJsModule = typeof import("pdfjs-dist");

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PdfExtractionError("PDF_ABORTED");
  }
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    return String((error as { name?: unknown }).name);
  }
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

function mapPdfError(error: unknown, pdfjs: PdfJsModule): PdfExtractionError {
  if (error instanceof PdfExtractionError) return error;

  if (errorName(error) === "AbortError") {
    return new PdfExtractionError("PDF_ABORTED", { cause: error });
  }

  if (
    error instanceof pdfjs.PasswordException ||
    errorName(error) === "PasswordException"
  ) {
    return new PdfExtractionError("PDF_PASSWORD_PROTECTED", { cause: error });
  }

  if (
    error instanceof pdfjs.InvalidPDFException ||
    errorName(error) === "InvalidPDFException"
  ) {
    return new PdfExtractionError("PDF_INVALID", { cause: error });
  }

  if (
    error instanceof pdfjs.AbortException ||
    errorName(error) === "AbortException"
  ) {
    return new PdfExtractionError("PDF_ABORTED", { cause: error });
  }

  const message = errorMessage(error);
  if (
    message.includes("worker") ||
    message.includes("fake worker") ||
    message.includes("dynamically imported module")
  ) {
    return new PdfExtractionError("PDF_WORKER_FAILED", { cause: error });
  }

  return new PdfExtractionError("PDF_PARSE_FAILED", { cause: error });
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length === 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/**
 * Parse a text-based PDF entirely in the browser. The PDF bytes never leave the
 * device; only the returned per-page text is sent to the server.
 */
export async function extractPdf(
  file: File,
  options: ExtractPdfOptions = {},
): Promise<ExtractedReport> {
  const { signal, onProgress } = options;

  assertNotAborted(signal);

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new PdfExtractionError("PDF_UNSUPPORTED_TYPE");
  }

  if (
    file.type &&
    file.type !== "application/pdf" &&
    file.type !== "application/octet-stream"
  ) {
    throw new PdfExtractionError("PDF_UNSUPPORTED_TYPE");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new PdfExtractionError("PDF_TOO_LARGE");
  }

  let signature: Uint8Array;
  try {
    signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  } catch (error) {
    throw new PdfExtractionError("PDF_PARSE_FAILED", { cause: error });
  }

  if (!hasPdfSignature(signature)) {
    throw new PdfExtractionError("PDF_UNSUPPORTED_TYPE");
  }

  assertNotAborted(signal);

  let data: Uint8Array;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (signal?.aborted) {
      throw new PdfExtractionError("PDF_ABORTED", { cause: error });
    }
    throw new PdfExtractionError("PDF_PARSE_FAILED", { cause: error });
  }

  assertNotAborted(signal);

  let pdfjs: PdfJsModule;
  try {
    pdfjs = await import("pdfjs-dist");
  } catch (error) {
    throw new PdfExtractionError("PDF_WORKER_FAILED", { cause: error });
  }

  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
  let pdf: import("pdfjs-dist").PDFDocumentProxy | undefined;

  try {
    loadingTask = pdfjs.getDocument({
      data,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
    });

    pdf = await loadingTask.promise;
    assertNotAborted(signal);

    if (pdf.numPages > MAX_PAGES) {
      throw new PdfExtractionError("PDF_TOO_MANY_PAGES");
    }

    const pages: ExtractedPage[] = [];
    let totalChars = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      assertNotAborted(signal);

      const page = await pdf.getPage(pageNumber);

      try {
        const content = await page.getTextContent();
        let text = "";

        for (const item of content.items) {
          if ("str" in item) {
            text += item.str;
            text += item.hasEOL ? "\n" : " ";
          }
        }

        text = normalizeExtractedText(text);

        if (text.length > MAX_PAGE_CHARS) {
          throw new PdfExtractionError("PDF_TEXT_TOO_LARGE");
        }

        totalChars += text.length;
        if (totalChars > MAX_TEXT_CHARS) {
          throw new PdfExtractionError("PDF_TEXT_TOO_LARGE");
        }

        pages.push({ page: pageNumber, text });
      } finally {
        page.cleanup();
      }

      onProgress?.(pageNumber, pdf.numPages);
    }

    assertNotAborted(signal);

    if (totalChars < MIN_TEXT_CHARS) {
      throw new PdfExtractionError("PDF_SCANNED");
    }

    return {
      filename: file.name,
      fileSize: file.size,
      pageCount: pdf.numPages,
      pages,
    };
  } catch (error) {
    throw mapPdfError(error, pdfjs);
  } finally {
    if (loadingTask) {
      await loadingTask.destroy().catch(() => undefined);
    }
  }
}
