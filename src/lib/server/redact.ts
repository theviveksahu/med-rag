import "server-only";

/**
 * Best-effort redaction for the demographic header that commonly appears at
 * the top of a lab report. Retrieved text is redacted immediately before it is
 * written into the in-memory agent backend, so the provider never receives
 * patient names, contact details, or record identifiers from that header.
 *
 * This is deliberately conservative: it keeps medical values and narrative
 * intact, and it does not attempt to identify every possible PII pattern.
 */

const LABELED_FIELD_RE = new RegExp(
  String.raw`^(\s*(?:patient(?:\s+name)?|name|full\s+name|dob|date\s+of\s+birth|birth\s+date|mrn|medical\s+record(?:\s+(?:number|no\.?))?|patient\s+id|address|phone|telephone|email|e-?mail|ssn|social\s+security|member\s+id|insurance(?:\s+id)?|accession(?:\s+(?:number|no\.?))?|account(?:\s+(?:number|no\.?))?|ordering\s+(?:provider|physician)|provider|physician|doctor|dr\.?)\s*[:#-]\s*)(.+)$`,
  "i",
);

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE =
  /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

const MEDICAL_OR_ORGANIZATION_WORDS =
  /(?:lab|laborator|diagnostic|report|result|test|panel|blood|urine|count|profile|metabolic|lipid|thyroid|page|patient|clinic|hospital|health|medical|date|specimen|collection|physician|provider|doctor|imaging|pathology|screen|assay|level|value|range|reference)/i;

function looksLikePersonName(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  if (/\d/.test(trimmed)) return false;
  if (/[|<>@/:]/.test(trimmed)) return false;
  if (MEDICAL_OR_ORGANIZATION_WORDS.test(trimmed)) return false;

  const words = trimmed.replace(/[.,]/g, "").split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  const titleCase = words.every((word) => /^[A-Z][a-z'’-]+$/.test(word));
  const upperCase = words.every((word) => /^[A-Z][A-Z'’-]+$/.test(word));

  return titleCase || upperCase;
}

function redactLine(line: string, inHeader: boolean): string {
  let redacted = line;

  const labeled = redacted.match(LABELED_FIELD_RE);
  if (labeled) {
    redacted = `${labeled[1]}[redacted]`;
  } else if (inHeader && looksLikePersonName(redacted)) {
    redacted = "[redacted name]";
  }

  return redacted
    .replace(EMAIL_RE, "[redacted email]")
    .replace(PHONE_RE, "[redacted phone]")
    .replace(SSN_RE, "[redacted id]");
}

export function redactReportPii(text: string): string {
  const lines = text.split("\n");

  return lines
    .map((line, index) => redactLine(line, index < 30))
    .join("\n");
}
