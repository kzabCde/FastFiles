import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs/promises";
import { deflateSync } from "node:zlib";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");

async function makePdf(pageCount = 1) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`FastFiles v0.2 page ${index + 1}`, { x: 48, y: 780, size: 18 });
  }
  return Buffer.from(await pdf.save());
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBytes, data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, checksum]);
}

async function makeImageHeavyPdf() {
  const width = 720;
  const height = 900;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  let random = 0x12345678;
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 3 + 1);
    rows[offset] = 0;
    for (let x = 0; x < width * 3; x += 1) {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      rows[offset + x + 1] = random & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const image = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedPng(image);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawImage(embedded, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
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
  await page.getByRole("button", { name: /Image Editor/i }).first().click();
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
  await page.getByRole("button", { name: /Image Editor/i }).first().click();
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
  await page.getByRole("button", { name: /Image Editor/i }).first().click();
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
  await page.getByRole("button", { name: /Image Editor/i }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("language can be switched before entering a workspace and remains Thai", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TH", exact: true }).click();
  await upload(page, [{ name: "ภาษาไทย.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /แก้ไขรูปภาพ/ }).first().click();
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

test("PDF metadata workspace can edit and clear supported text metadata", async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Private title");
  pdf.setAuthor("FastFiles Test");
  pdf.addPage();
  await page.goto("/");
  await upload(page, [{ name: "metadata.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) }]);
  await expect(page.getByText("metadata.pdf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /PDF Metadata/i }).first().click();
  await expect(page.getByText("Private title")).toBeVisible();

  await page.getByLabel("TITLE").fill("Public title");
  await page.getByLabel("AUTHOR").fill("Updated Author");
  await page.getByLabel("KEYWORDS, COMMA-SEPARATED").fill("fastfiles, local, pdf");
  const editDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /SAVE METADATA/i }).click();
  const editedDownload = await editDownloadPromise;
  const editedPath = await editedDownload.path();
  const edited = await PDFDocument.load(await fs.readFile(editedPath!));
  expect(edited.getTitle()).toBe("Public title");
  expect(edited.getAuthor()).toBe("Updated Author");
  expect(edited.getKeywords()).toContain("fastfiles");

  await page.getByRole("button", { name: /Change settings/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /CLEAR TEXT METADATA/i }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const cleaned = await PDFDocument.load(await fs.readFile(path!));
  expect(cleaned.getTitle() ?? "").toBe("");
  expect(cleaned.getAuthor() ?? "").toBe("");
});

test("PDF text extraction supports page ranges and TXT download", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "selectable.pdf", mimeType: "application/pdf", buffer: await makePdf(3) }]);
  await expect(page.getByText("selectable.pdf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Extract PDF Text/i }).first().click();
  await page.getByLabel("PAGE RANGE (BLANK = ALL)").fill("2");
  await page.getByRole("button", { name: /EXTRACT TEXT/i }).click();

  const result = page.getByTestId("pdf-text-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("FastFiles v0.2 page 2");
  await expect(result).not.toContainText("FastFiles v0.2 page 1");

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: /DOWNLOAD TXT/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("selectable-text.txt");
  const path = await download.path();
  const text = await fs.readFile(path!, "utf8");
  expect(text).toContain("--- Page 2 ---");
  expect(text).toContain("FastFiles v0.2 page 2");
});

test("scanned PDF compression compares output honestly before download", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "text-document.pdf", mimeType: "application/pdf", buffer: await makePdf(2) }]);
  await page.getByRole("button", { name: /Compress Scanned PDF/i }).first().click();
  const workspace = page.getByTestId("compress-pdf-workspace");
  await expect(workspace).toBeVisible();
  await workspace.getByRole("button", { name: "Small file" }).click();
  await workspace.getByRole("button", { name: /PROCESS & COMPARE/i }).click();

  const result = page.getByTestId("result-center");
  await expect(result).toBeVisible();
  await expect(result).toContainText("OUTPUT IS NOT SMALLER THAN THE ORIGINAL");
  await expect(result).toContainText("Keep the original");

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("text-document-compressed.pdf");
  const path = await download.path();
  const compressed = await PDFDocument.load(await fs.readFile(path!));
  expect(compressed.getPageCount()).toBe(2);
});

test("scanned PDF compression reduces an image-heavy document", async ({ page }) => {
  await page.goto("/");
  const source = await makeImageHeavyPdf();
  await upload(page, [{ name: "large-scan.pdf", mimeType: "application/pdf", buffer: source }]);
  await page.getByRole("button", { name: /Compress Scanned PDF/i }).first().click();
  await page.getByTestId("compress-pdf-workspace").getByRole("button", { name: "Small file" }).click();
  await page.getByRole("button", { name: /PROCESS & COMPARE/i }).click();

  const result = page.getByTestId("result-center");
  await expect(result).toContainText("PDF SIZE REDUCED");
  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  const output = await fs.readFile(path!);
  expect(output.byteLength).toBeLessThan(source.byteLength);
  expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
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


test("language can be switched after entering a workspace", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "workspace-language.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Image Editor/i }).first().click();
  await expect(page.getByText("SETTINGS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to Thai" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByText("การตั้งค่า", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("SETTINGS", { exact: true })).toBeVisible();
});

test("partial image batch preserves successes and can retry only failed files", async ({ page }) => {
  await page.goto("/");
  await upload(page, [
    { name: "success.png", mimeType: "image/png", buffer: png },
    { name: "retry.png", mimeType: "image/png", buffer: png },
  ]);
  await page.getByRole("button", { name: /Image Editor/i }).first().click();

  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let calls = 0;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      calls += 1;
      if (calls === 2) {
        callback(null);
        return;
      }
      return original.call(this, callback, type, quality);
    };
  });

  const firstDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /PROCESS 2 FILES/i }).click();
  await firstDownload;
  const result = page.getByTestId("result-center");
  await expect(result).toBeVisible();
  await expect(result).toContainText("PARTIAL SUCCESS");
  await expect(result).toContainText("success.webp");
  await expect(result).toContainText("retry.png");
  await expect(result.getByRole("button", { name: /Retry failed/i })).toBeVisible();

  const retryDownload = page.waitForEvent("download");
  await result.getByRole("button", { name: /Retry failed/i }).click();
  const retried = await retryDownload;
  expect(retried.suggestedFilename()).toMatch(/retry\.webp$/i);
  await expect(page.getByTestId("result-center")).toContainText("RETRY COMPLETED");
  await expect(page.getByTestId("result-center")).toContainText("retry.webp");
});
