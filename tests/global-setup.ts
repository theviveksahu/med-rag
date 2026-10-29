import { createTestPdf } from "../scripts/make-test-pdf";

export default async function globalSetup(): Promise<void> {
  await createTestPdf();
}
