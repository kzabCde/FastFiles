import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs/promises";

async function makePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 2; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`FastFiles HTML export page ${index + 1}`, { x: 48, y: 780, size: 20, font });
  }
  return Buffer.from(await pdf.save());
}

test("HTML to PDF sanitizes active content and downloads a valid PDF", async ({ page }) => {
  await page.goto("/tools/html-to-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "safe-document.html",
    mimeType: "text/html",
    buffer: Buffer.from(`<!doctype html><html><head><style>body{font-family:Arial;padding:24px}h1{color:#126b4f}</style></head><body><h1>FastFiles HTML</h1><p>Local conversion test</p><script>window.__unsafe_ran=true</script><img src="https://example.com/tracker.png" onerror="window.__unsafe_ran=true"></body></html>`),
  });

  await expect(page.getByTestId("html-to-pdf-workspace")).toBeVisible();
  const preview = page.frameLocator('iframe[title="Sanitized HTML preview"]');
  await expect(preview.getByRole("heading", { name: "FastFiles HTML" })).toBeVisible();
  await expect(preview.locator("script")).toHaveCount(0);
  await expect(preview.locator("img")).not.toHaveAttribute("src", /example\.com/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOWNLOAD PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("safe-document.pdf");
  const path = await download.path();
  const output = await PDFDocument.load(await fs.readFile(path!));
  expect(output.getPageCount()).toBeGreaterThanOrEqual(1);
});

test("pasted HTML opens the local converter workspace", async ({ page }) => {
  await page.goto("/tools/html-to-pdf");
  await page.getByLabel("HTML code").fill("<main><h1>Pasted locally</h1><p>No upload required.</p></main>");
  await page.getByRole("button", { name: "OPEN PREVIEW" }).click();
  await expect(page.getByTestId("html-to-pdf-workspace")).toBeVisible();
  await expect(page.frameLocator('iframe[title="Sanitized HTML preview"]').getByRole("heading", { name: "Pasted locally" })).toBeVisible();
});

test("PDF to HTML downloads a self-contained searchable HTML file", async ({ page }) => {
  await page.goto("/tools/pdf-to-html");
  await page.locator('input[type="file"]').setInputFiles({ name: "two-pages.pdf", mimeType: "application/pdf", buffer: await makePdf() });
  await expect(page.getByTestId("pdf-to-html-workspace")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CONVERT & DOWNLOAD" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("two-pages.html");
  const path = await download.path();
  const html = await fs.readFile(path!, "utf8");
  expect(html.match(/<section class="page"/g)).toHaveLength(2);
  expect(html).toContain("data:image/");
  expect(html).toContain("FastFiles HTML export page 1");
  expect(html).not.toContain("<script");
});

test("PDF to HTML can bundle page assets into a ZIP", async ({ page }) => {
  await page.goto("/tools/pdf-to-html");
  await page.locator('input[type="file"]').setInputFiles({ name: "archive.pdf", mimeType: "application/pdf", buffer: await makePdf() });
  await page.getByLabel("OUTPUT").selectOption("zip");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CONVERT & DOWNLOAD" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("archive-html.zip");
  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  expect(zip.file("index.html")).not.toBeNull();
  expect(Object.keys(zip.files).filter((name) => /^page-\d+\.(?:webp|jpg)$/.test(name))).toHaveLength(2);
});

test("converter pages remain usable without horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/html-to-pdf");
  await page.getByLabel("HTML code").fill("<h1>Mobile HTML</h1>");
  await page.getByRole("button", { name: "OPEN PREVIEW" }).click();
  await expect(page.getByTestId("html-to-pdf-workspace")).toBeVisible();
  const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
});
