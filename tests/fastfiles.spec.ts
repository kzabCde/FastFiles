import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs/promises";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

async function makePdf(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`FastFiles test page ${index + 1}`, { x: 48, y: 780, size: 20 });
  }
  return Buffer.from(await pdf.save());
}

async function upload(page: Page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  await page.locator('input[type="file"]').setInputFiles(files);
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.bodyScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function assertKeyTextNotClipped(page: Page) {
  const escaped = await page.locator("h1, h2, .tool-name, .brand").evaluateAll((nodes) => {
    const width = document.documentElement.clientWidth;
    return nodes
      .filter((node) => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null;
      })
      .filter((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        return rect.left < -1 || rect.right > width + 1;
      })
      .map((node) => (node.textContent || "").trim())
      .filter(Boolean);
  });
  expect(escaped).toEqual([]);
}

test("landing page renders cleanly in English and Thai", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Processed locally|files stay on your device/i).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertKeyTextNotClipped(page);

  await page.getByRole("button", { name: "TH", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("จัดการไฟล์");
  await expect(page.getByText(/ไฟล์ของคุณยังอยู่บนอุปกรณ์ของคุณ/)).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertKeyTextNotClipped(page);
});

test("mobile layout has no horizontal overflow and keeps upload reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /FastFiles home/i })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await assertNoHorizontalOverflow(page);
  await assertKeyTextNotClipped(page);

  await page.getByRole("button", { name: "TH", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("จัดการไฟล์");
  await assertNoHorizontalOverflow(page);
  await assertKeyTextNotClipped(page);
});

test("image upload, conversion and download works", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "sample.png", mimeType: "image/png", buffer: onePixelPng }]);

  await expect(page.getByText("sample.png")).toBeVisible();
  await page.getByRole("button", { name: /Image Converter/i }).first().click();
  await expect(page.getByText(/SETTINGS/i).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/sample\.webp$/i);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await fs.stat(path!)).size).toBeGreaterThan(0);
});

test("merging PDFs produces a valid two-page PDF download", async ({ page }) => {
  await page.goto("/");
  const pdfA = await makePdf(1);
  const pdfB = await makePdf(1);
  await upload(page, [
    { name: "a.pdf", mimeType: "application/pdf", buffer: pdfA },
    { name: "b.pdf", mimeType: "application/pdf", buffer: pdfB },
  ]);

  await page.getByRole("button", { name: /Merge PDF/i }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /MERGE.*DOWNLOAD/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("fastfiles-merged.pdf");
  const path = await download.path();
  const merged = await PDFDocument.load(await fs.readFile(path!));
  expect(merged.getPageCount()).toBe(2);
});

test("split PDF downloads a ZIP containing every page", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "two-pages.pdf", mimeType: "application/pdf", buffer: await makePdf(2) }]);

  await page.getByRole("button", { name: /Split.*Extract PDF/i }).first().click();
  await expect(page.getByText(/2 pages/i)).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /SPLIT ALL TO ZIP/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("two-pages-pages.zip");
  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  expect(Object.keys(zip.files).filter((name) => name.endsWith(".pdf"))).toHaveLength(2);
});

test("PDF thumbnails render and PDF to image download works without UI errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  const fixture = { name: "render.pdf", mimeType: "application/pdf", buffer: await makePdf(2) };
  await upload(page, [fixture]);
  await page.getByRole("button", { name: /Organize PDF/i }).first().click();
  await expect(page.locator(".page-thumb img")).toHaveCount(2, { timeout: 20_000 });
  await assertNoHorizontalOverflow(page);

  await page.getByRole("button", { name: /TOOLS/i }).click();
  await page.getByRole("button", { name: /PDF to Images/i }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /CONVERT.*DOWNLOAD ZIP/i }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  expect(Object.keys(zip.files).filter((name) => name.endsWith(".png"))).toHaveLength(2);

  const actionableErrors = consoleErrors.filter((message) => !/favicon|hydration.*dev/i.test(message));
  expect(actionableErrors).toEqual([]);
});
