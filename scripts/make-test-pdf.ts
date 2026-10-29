import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const DEFAULT_OUTPUT = resolve("tests/fixtures/lab-report.pdf");

const PAGE_ONE = [
  "Synthetic Lab Report - NOT A REAL PATIENT",
  "Patient Name: [redacted]",
  "DOB: [redacted]",
  "MRN: [redacted]",
  "",
  "Complete Blood Count",
  "Hemoglobin: 13.8 g/dL (reference 12.0-16.0)",
  "Hematocrit: 41.2 % (reference 36.0-46.0)",
  "White Blood Cells: 6.4 x10^3/uL (reference 4.0-11.0)",
  "Platelets: 245 x10^3/uL (reference 150-400)",
  "",
  "This synthetic report exists only for automated testing.",
  "It is not a real patient record and contains no real personal data.",
];

const PAGE_TWO = [
  "Synthetic Lab Report - NOT A REAL PATIENT",
  "Basic Metabolic Panel",
  "Glucose: 92 mg/dL (reference 70-99)",
  "Creatinine: 0.9 mg/dL (reference 0.6-1.1)",
  "Sodium: 140 mmol/L (reference 135-145)",
  "Potassium: 4.1 mmol/L (reference 3.5-5.1)",
  "",
  "Impression",
  "No urgent abnormalities identified in this synthetic sample.",
  "",
  "This document is a test fixture. It must never be shown in the app UI.",
];

async function drawPage(pdf: PDFDocument, lines: string[]): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  let y = 742;

  for (const line of lines) {
    page.drawText(line, {
      x: 54,
      y,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= line ? 18 : 10;
  }
}

export async function createTestPdf(outputPath = DEFAULT_OUTPUT): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Synthetic Lab Report - NOT A REAL PATIENT");
  pdf.setAuthor("Med-RAG tests");

  await drawPage(pdf, PAGE_ONE);
  await drawPage(pdf, PAGE_TWO);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await pdf.save());
  return outputPath;
}
