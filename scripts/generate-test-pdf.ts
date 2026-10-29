import { resolve } from "node:path";
import { createTestPdf } from "./make-test-pdf";

async function main(): Promise<void> {
  const output = process.argv[2]
    ? resolve(process.argv[2])
    : resolve("tests/fixtures/lab-report.pdf");

  const written = await createTestPdf(output);
  console.log(`Wrote synthetic test PDF: ${written}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
