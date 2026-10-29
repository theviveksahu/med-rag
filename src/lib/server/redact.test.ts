import { describe, expect, it } from "vitest";
import { redactReportPii } from "./redact";

describe("redactReportPii", () => {
  it("redacts labeled demographic fields in the header", () => {
    const result = redactReportPii(
      [
        "Synthetic Medical Report",
        "Patient Name: Jane Doe",
        "DOB: 01/02/1980",
        "MRN: 123456",
        "Phone: (555) 123-4567",
        "Email: jane.doe@example.com",
        "Address: 1 Example Street",
      ].join("\n"),
    );

    expect(result).toContain("Patient Name: [redacted]");
    expect(result).toContain("DOB: [redacted]");
    expect(result).toContain("MRN: [redacted]");
    expect(result).toContain("Phone: [redacted]");
    expect(result).toContain("Email: [redacted]");
    expect(result).toContain("Address: [redacted]");
    expect(result).not.toContain("Jane Doe");
    expect(result).not.toContain("jane.doe@example.com");
    expect(result).not.toContain("555");
  });

  it("redacts a bare person name near the top", () => {
    expect(redactReportPii("Jane Doe\nHemoglobin: 13.8 g/dL")).toBe(
      "[redacted name]\nHemoglobin: 13.8 g/dL",
    );
  });

  it("preserves medical values, units, and reference ranges", () => {
    const text = [
      "Complete Blood Count",
      "Hemoglobin: 13.8 g/dL (reference 12.0-16.0)",
      "Glucose: 92 mg/dL (reference 70-99)",
      "Creatinine: 0.9 mg/dL (reference 0.6-1.1)",
    ].join("\n");

    expect(redactReportPii(text)).toBe(text);
  });

  it("does not treat report headings or organizations as names", () => {
    const text = [
      "Synthetic Medical Report",
      "Complete Blood Count",
      "Reference Range",
    ].join("\n");

    expect(redactReportPii(text)).toBe(text);
  });

  it("redacts contact patterns anywhere in the document", () => {
    const result = redactReportPii(
      [
        "Result: normal",
        "Call (555) 123-4567 or email patient@example.com.",
        "SSN 123-45-6789",
      ].join("\n"),
    );

    expect(result).toContain("[redacted phone]");
    expect(result).toContain("[redacted email]");
    expect(result).toContain("[redacted id]");
  });

  it("only applies bare-name redaction near the header", () => {
    const lines = Array.from({ length: 31 }, (_, index) => `Line ${index + 1}`);
    lines.push("Jane Doe");

    const result = redactReportPii(lines.join("\n"));
    expect(result).toContain("Jane Doe");
  });
});
