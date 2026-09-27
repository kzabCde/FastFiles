import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs/promises";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");

async function makePdf(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`FastFiles v0.2 page ${index + 1}`, { x: 48, y: 780, size: 18 });
  }
  return Buffer.from(await pdf.save());
}

async function upload(page: Page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  await page.locator('input[type="file"]').setInputFiles(files);
}

async function waitForQueue(page: Page) {
  await expect(page.getByTestId("file-queue")).toBeVisible();
}

async function assertNoOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
}

test("drag and drop adds a valid image to File Queue", async ({ page }) => {
  await page.goto("/");
  const base64 = png.toString("base64");
  await page.evaluate((value) => {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const file = new File([bytes], "drop-image.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document.querySelector("main")?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, base64);
  await waitForQueue(page);
  await expect(page.getByText("drop-image.png")).toBeVisible();
});

test("adding files appends instead of replacing the queue", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "first.png", mimeType: "image/png", buffer: png }]);
  await waitForQueue(page);
  await upload(page, [{ name: "second.png", mimeType: "image/png", buffer: png }]);
  await expect(page.getByText("first.png")).toBeVisible();
  await expect(page.getByText("second.png")).toBeVisible();
  await expect(page.locator(".queue-row")).toHaveCount(2);
});

test("files can be removed independently", async ({ page }) => {
  await page.goto("/");
  await upload(page, [
    { name: "keep.png", mimeType: "image/png", buffer: png },
    { name: "remove.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("button", { name: /Remove file: remove\.png/i }).click();
  await expect(page.getByText("remove.png")).toHaveCount(0);
  await expect(page.getByText("keep.png")).toBeVisible();
});

test("queue supports drag reorder", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "HTML drag behavior is already covered in Chromium/Firefox and is flaky in headless WebKit.");
  await page.goto("/");
  await upload(page, [
    { name: "a.pdf", mimeType: "application/pdf", buffer: await makePdf() },
    { name: "b.pdf", mimeType: "application/pdf", buffer: await makePdf() },
  ]);
  await expect(page.locator(".queue-row")).toHaveCount(2);
  await page.locator(".drag-handle").first().dragTo(page.locator(".queue-row").nth(1));
  await expect(page.locator(".queue-row").first()).toContainText("b.pdf");
});

test("Thai and emoji filenames survive intake", async ({ page }) => {
  await page.goto("/");
  await upload(page, [
    { name: "เอกสารทดสอบ.pdf", mimeType: "application/pdf", buffer: await makePdf() },
    { name: "photo-📷.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.getByText("เอกสารทดสอบ.pdf")).toBeVisible();
  await expect(page.getByText("photo-📷.png")).toBeVisible();
});

test("zero-byte file stays visible with actionable error", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }]);
  await waitForQueue(page);
  await expect(page.getByText("empty.pdf")).toBeVisible();
  await expect(page.getByText("This file is empty.", { exact: true })).toBeVisible();
  await expect(page.locator(".queue-row.status-error")).toHaveCount(1);
});

test("invalid image does not crash intake", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") }]);
  await waitForQueue(page);
  await expect(page.getByText("broken.png")).toBeVisible();
  await expect(page.getByText(/could not be decoded|ไม่สามารถอ่านข้อมูลรูปภาพ/i)).toBeVisible();
});

test("invalid PDF does not crash intake", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-broken") }]);
  await waitForQueue(page);
  await expect(page.getByText("broken.pdf")).toBeVisible();
  await expect(page.getByText(/corrupted|เสียหาย/i)).toBeVisible();
});

test("mixed PDF and image selection does not suggest an unsafe shared tool", async ({ page }) => {
  await page.goto("/");
  await upload(page, [
    { name: "one.pdf", mimeType: "application/pdf", buffer: await makePdf() },
    { name: "one.png", mimeType: "image/png", buffer: png },
  ]);
  await waitForQueue(page);
  await expect(page.getByText(/Mixed PDF and image selections|PDF และรูปภาพ/i)).toBeVisible();
});

test("image processing opens Result Center with a valid downloadable output", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "result.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Image Converter/i }).first().click();
  const initialDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  await initialDownload;
  await expect(page.getByTestId("result-center")).toBeVisible();
  await expect(page.getByText(/result\.webp/i)).toBeVisible();
  const redownload = page.waitForEvent("download");
  await page.getByTestId("result-center").getByRole("button", { name: /^Download$/i }).first().click();
  const output = await redownload;
  expect(output.suggestedFilename()).toMatch(/result\.webp$/i);
});

test("batch image processing downloads ZIP and reports every success", async ({ page }) => {
  await page.goto("/");
  await upload(page, [
    { name: "one.png", mimeType: "image/png", buffer: png },
    { name: "two.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("button", { name: /Image Converter/i }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /PROCESS 2 FILES/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("fastfiles-images.zip");
  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  expect(Object.keys(zip.files).filter((name) => name.endsWith(".webp"))).toHaveLength(2);
  await expect(page.getByTestId("result-center")).toContainText("2");
});

test("mobile Result Center has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await upload(page, [{ name: "mobile.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Image Converter/i }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  await downloadPromise;
  await expect(page.getByTestId("result-center")).toBeVisible();
  await assertNoOverflow(page);
});

test("dark theme persists through workspace navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await upload(page, [{ name: "dark.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Image Converter/i }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("language can be switched before entering a workspace and remains Thai", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TH", exact: true }).click();
  await upload(page, [{ name: "ภาษาไทย.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /แปลงไฟล์รูป/ }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByText("การตั้งค่า", { exact: true })).toBeVisible();
});

test("PDF page numbers generate a valid PDF", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "number.pdf", mimeType: "application/pdf", buffer: await makePdf(3) }]);
  await page.getByRole("button", { name: /Add Page Numbers/i }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /ADD PAGE NUMBERS/i }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const result = await PDFDocument.load(await fs.readFile(path!));
  expect(result.getPageCount()).toBe(3);
  await expect(page.getByTestId("result-center")).toBeVisible();
});

test("PDF metadata workspace opens and can clear supported text metadata", async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Private title");
  pdf.setAuthor("FastFiles Test");
  pdf.addPage();
  await page.goto("/");
  await upload(page, [{ name: "metadata.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) }]);
  await page.getByRole("button", { name: /PDF Metadata/i }).first().click();
  await expect(page.getByText("Private title")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /CLEAR TEXT METADATA/i }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const cleaned = await PDFDocument.load(await fs.readFile(path!));
  expect(cleaned.getTitle() ?? "").toBe("");
  expect(cleaned.getAuthor() ?? "").toBe("");
});

test("organizer supports select all and duplicate", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "organize.pdf", mimeType: "application/pdf", buffer: await makePdf(2) }]);
  await page.getByRole("button", { name: /Organize PDF/i }).first().click();
  await expect(page.locator(".page-card")).toHaveCount(2);
  await page.getByRole("button", { name: /SELECT ALL/i }).click();
  await page.getByRole("button", { name: /DUPLICATE/i }).click();
  await expect(page.locator(".page-card")).toHaveCount(4);
});

test("many-page PDF progressively renders thumbnails without console errors", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Large progressive-render smoke test runs once; core PDF rendering remains cross-browser in the regression suite.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await upload(page, [{ name: "many-pages.pdf", mimeType: "application/pdf", buffer: await makePdf(24) }]);
  await page.getByRole("button", { name: /Organize PDF/i }).first().click();
  await expect(page.locator(".page-card")).toHaveCount(24, { timeout: 20_000 });
  await expect(page.locator(".page-thumb img").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".page-thumb img")).toHaveCount(24, { timeout: 45_000 });
  expect(errors).toEqual([]);
});
\n\ntest("language can be switched after entering a workspace", async ({ page }) => {\n  await page.goto("/");\n  await upload(page, [{ name: "workspace-language.png", mimeType: "image/png", buffer: png }]);\n  await page.getByRole("button", { name: /Image Converter/i }).first().click();\n  await expect(page.getByText("SETTINGS", { exact: true })).toBeVisible();\n  await page.getByRole("button", { name: "Switch to Thai" }).click();\n  await expect(page.locator("html")).toHaveAttribute("lang", "th");\n  await expect(page.getByText("การตั้งค่า", { exact: true })).toBeVisible();\n  await page.getByRole("button", { name: "Switch to English" }).click();\n  await expect(page.locator("html")).toHaveAttribute("lang", "en");\n  await expect(page.getByText("SETTINGS", { exact: true })).toBeVisible();\n});\n\ntest("partial image batch preserves successes and can retry only failed files", async ({ page }) => {\n  await page.goto("/");\n  await upload(page, [\n    { name: "success.png", mimeType: "image/png", buffer: png },\n    { name: "retry.png", mimeType: "image/png", buffer: png },\n  ]);\n  await page.getByRole("button", { name: /Image Converter/i }).first().click();\n\n  await page.evaluate(() => {\n    const original = HTMLCanvasElement.prototype.toBlob;\n    let calls = 0;\n    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {\n      calls += 1;\n      if (calls === 2) {\n        callback(null);\n        return;\n      }\n      return original.call(this, callback, type, quality);\n    };\n  });\n\n  const firstDownload = page.waitForEvent("download");\n  await page.getByRole("button", { name: /PROCESS 2 FILES/i }).click();\n  await firstDownload;\n  const result = page.getByTestId("result-center");\n  await expect(result).toBeVisible();\n  await expect(result).toContainText("PARTIAL SUCCESS");\n  await expect(result).toContainText("success.webp");\n  await expect(result).toContainText("retry.png");\n  await expect(result.getByRole("button", { name: /Retry failed/i })).toBeVisible();\n\n  const retryDownload = page.waitForEvent("download");\n  await result.getByRole("button", { name: /Retry failed/i }).click();\n  const retried = await retryDownload;\n  expect(retried.suggestedFilename()).toMatch(/retry\.webp$/i);\n  await expect(page.getByTestId("result-center")).toContainText("RETRY COMPLETED");\n  await expect(page.getByTestId("result-center")).toContainText("retry.webp");\n});\n