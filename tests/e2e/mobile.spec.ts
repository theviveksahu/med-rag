import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const FIXTURE = resolve("tests/fixtures/lab-report.pdf");

test.use({ viewport: { width: 390, height: 844 } });

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

test("upload and chat fit a narrow phone without horizontal scrolling", async ({
  page,
}) => {
  await page.route("**/api/upload", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: [
        JSON.stringify({
          type: "stage",
          stage: "preparing",
          message: "Preparing sections",
          current: 1,
          total: 1,
        }),
        JSON.stringify({
          type: "stage",
          stage: "embedding",
          message: "Indexing 1 of 1 sections",
          current: 1,
          total: 1,
          progress: 100,
        }),
        JSON.stringify({
          type: "stage",
          stage: "finalizing",
          message: "Finishing up",
        }),
        JSON.stringify({
          type: "done",
          report: {
            filename: "lab-report.pdf",
            pageCount: 2,
            chunkCount: 1,
            sizeBytes: 1_400,
          },
          reused: false,
        }),
        "",
      ].join("\n"),
    });
  });

  await page.route("**/api/session/end", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await expect(page.getByText("Drop your PDF here")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.getByRole("button", { name: "Analyze report" }).click();

  await expect(page.getByText("What would you like to know?")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByPlaceholder("Ask about your report…"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
