import { z } from "zod";
import {
  MAX_CHAT_MESSAGES,
  MAX_PAGE_CHARS,
  MAX_PAGES,
  MAX_PDF_BYTES,
  MAX_REPORT_FILENAME_CHARS,
  MAX_TEXT_CHARS,
  MIN_TEXT_CHARS,
} from "./limits";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const sessionIdSchema = z
  .string()
  .trim()
  .regex(UUID_RE, "Invalid session id.");

export type SessionId = z.infer<typeof sessionIdSchema>;

export const uploadPageSchema = z.object({
  page: z.number().int().min(1).max(MAX_PAGES),
  text: z.string().max(MAX_PAGE_CHARS),
});

export type UploadPage = z.infer<typeof uploadPageSchema>;

export const uploadRequestSchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(MAX_REPORT_FILENAME_CHARS)
      .refine((name) => name.toLowerCase().endsWith(".pdf"), {
        message: "Filename must end with .pdf.",
      }),
    fileSize: z.number().int().positive().max(MAX_PDF_BYTES),
    pageCount: z.number().int().min(1).max(MAX_PAGES),
    pages: z.array(uploadPageSchema).min(1).max(MAX_PAGES),
  })
  .superRefine((value, ctx) => {
    if (value.pages.length !== value.pageCount) {
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "Page count does not match the number of pages.",
      });
    }

    value.pages.forEach((page, index) => {
      if (page.page !== index + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["pages", index, "page"],
          message: "Page numbers must be sequential starting at 1.",
        });
      }
    });

    const totalChars = value.pages.reduce(
      (total, page) => total + page.text.length,
      0,
    );

    if (totalChars < MIN_TEXT_CHARS) {
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "The extracted text is too short to index.",
      });
    }

    if (totalChars > MAX_TEXT_CHARS) {
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "The extracted text is too large to index.",
      });
    }
  });

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(MAX_CHAT_MESSAGES),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const endSessionSchema = z.object({
  sessionId: sessionIdSchema,
});

export type EndSessionRequest = z.infer<typeof endSessionSchema>;

export function isSessionId(value: unknown): value is SessionId {
  return sessionIdSchema.safeParse(value).success;
}
