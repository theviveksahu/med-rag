/**
 * Text normalization shared by the browser extractor and the server ingest
 * path. It preserves line structure and medical punctuation while collapsing
 * accidental horizontal whitespace.
 */
export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Build the deterministic text representation used for upload de-duplication.
 * Page boundaries are preserved so reordered pages do not collide.
 */
export function normalizeReport(
  pages: ReadonlyArray<{ page: number; text: string }>,
): string {
  return pages
    .map(
      (page) =>
        `--- page ${page.page} ---\n${normalizeExtractedText(page.text)}`,
    )
    .join("\n\n");
}
