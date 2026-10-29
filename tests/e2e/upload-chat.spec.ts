import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mockChatStream } from "./chat-stream";

const FIXTURE = resolve("tests/fixtures/lab-report.pdf");
const SESSION_KEY = "medrag.session.id";

test.describe("upload to chat happy path", () => {
  test("uploads extracted text, answers from the report, and starts over", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const uploadBodies: unknown[] = [];
    const chatBodies: unknown[] = [];
    const sessionEndBodies: string[] = [];

    await page.route("**/api/upload", async (route) => {
      uploadBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({
            type: "stage",
            stage: "preparing",
            message: "Splitting into sections",
            current: 8,
            total: 8,
          }),
          JSON.stringify({
            type: "stage",
            stage: "embedding",
            message: "Building the search index",
            current: 8,
            total: 8,
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
              chunkCount: 8,
              sizeBytes: 1_400,
            },
            reused: false,
          }),
          "",
        ].join("\n"),
      });
    });

    await page.route("**/api/chat", async (route) => {
      chatBodies.push(route.request().postDataJSON());
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_200));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: mockChatStream(),
      });
    });

    await page.route("**/api/session/end", async (route) => {
      const request = route.request();
      const rawBody = request.postData();
      const parsedBody = request.postDataJSON();
      sessionEndBodies.push(
        rawBody ??
          (parsedBody === null ? "" : JSON.stringify(parsedBody)),
      );
      await route.fulfill({ status: 204 });
    });

    await page.goto("/");

    await expect(page.getByText("Drop your PDF here")).toBeVisible();
    await expect(page.getByText("Not medical advice.")).toBeVisible();
    await expect(
      page.getByText("Your report is deleted when you leave"),
    ).toBeVisible();
    await expect(
      page.getByText("Private demo · no login"),
    ).toHaveCount(0);
    await expect(
      page.getByText("Consult a clinician for medical decisions"),
    ).toHaveCount(0);
    await expect(page.getByText("24h max")).toHaveCount(0);
    await expect(
      page.getByText(
        "Read in your browser. Only the extracted text is sent.",
      ),
    ).toHaveCount(0);
    await page.getByText("Privacy", { exact: true }).click();
    await expect(
      page.getByText(/deleted when you refresh or close the tab/),
    ).toBeVisible();
    await expect(page.getByText(/24 hours maximum/)).toHaveCount(0);
    await page.getByText("Privacy", { exact: true }).click();
    await expect(
      page.locator(
        'header svg path[d="M3 12h4l2.2-5.5L13 17l2.1-5H21"]',
      ),
    ).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      "href",
      /icon/,
    );

    const viewport = page.viewportSize();
    const shell = await page.locator("main > div").boundingBox();
    expect(viewport).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(shell!.width).toBeGreaterThan(viewport!.width - 40);
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await page.getByRole("button", { name: "Analyze report" }).click();

    await expect(page.getByText("Reading your PDF")).toBeVisible();
    await expect(page.getByText("What would you like to know?")).toBeVisible({
      timeout: 30_000,
    });

    expect(uploadBodies).toHaveLength(1);
    const uploadBody = uploadBodies[0] as {
      pages: Array<{ page: number; text: string }>;
      pageCount: number;
    };
    expect(uploadBody.pageCount).toBe(2);
    expect(uploadBody.pages).toHaveLength(2);
    expect(uploadBody.pages[0]?.text).toContain(
      "Synthetic Lab Report - NOT A REAL PATIENT",
    );
    expect(JSON.stringify(uploadBody)).not.toContain("%PDF-");

    await page
      .getByRole("button", {
        name: "What are the most important results in this report?",
      })
      .click();

    await expect(
      page.getByText(/Searched 4 sections · 2 analysts/),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Your report shows total cholesterol of 192 mg/dL"),
    ).toBeVisible();
    await expect(page.getByText("The report does not include a diagnosis")).toBeVisible();

    expect(chatBodies).toHaveLength(1);
    const chatBody = chatBodies[0] as {
      messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>;
    };
    expect(chatBody.messages.at(-1)?.role).toBe("user");
    expect(chatBody.messages.at(-1)?.parts[0]?.text).toContain(
      "most important results",
    );

    await page
      .getByRole("button", { name: /show agent trace/i })
      .click();
    await expect(page.getByText("Sections retrieved")).toBeVisible();
    await expect(
      page.getByText("“important results cholesterol glucose”"),
    ).toBeVisible();
    await expect(page.getByText("Synthesis")).toBeVisible();

    const oldSessionId = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      SESSION_KEY,
    );
    expect(oldSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await page.getByRole("button", { name: "Analyze another" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Delete and start over" })
      .click();

    await expect(page.getByText("Drop your PDF here")).toBeVisible();
    await expect
      .poll(() =>
        sessionEndBodies.some((body) => body.includes(oldSessionId ?? "")),
      )
      .toBe(true);

    const newSessionId = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      SESSION_KEY,
    );
    expect(newSessionId).not.toBe(oldSessionId);

    await page.reload();
    await expect(page.getByText("Drop your PDF here")).toBeVisible();
    await expect
      .poll(() =>
        sessionEndBodies.some((body) => body.includes(newSessionId ?? "")),
      )
      .toBe(true);

    const closeSessionId = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      SESSION_KEY,
    );
    await page.evaluate(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await expect
      .poll(() =>
        sessionEndBodies.some((body) => body.includes(closeSessionId ?? "")),
      )
      .toBe(true);
  });
});
