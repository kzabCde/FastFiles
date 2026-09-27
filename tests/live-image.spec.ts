import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");

async function upload(page: Page, files: Array<{ name: string; mimeType: string; buffer: Buffer }>) {
  await page.locator('input[type="file"]').setInputFiles(files);
}

async function assertNoOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
}

test("live image editor updates crop and transforms immediately", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "live-edit.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Image Converter/i }).first().click();

  const editor = page.getByTestId("live-image-editor");
  const preview = page.getByTestId("live-image-preview");
  await expect(editor).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(page.getByTestId("crop-overlay")).toHaveCount(0);

  await page.getByRole("button", { name: "4:3", exact: true }).click();
  await expect(page.getByTestId("crop-overlay")).toBeVisible();
  await expect(preview).toHaveAttribute("data-preview-rotation", "0");

  await page.getByTestId("rotate-image").click();
  await expect(preview).toHaveAttribute("data-preview-rotation", "90");
  await assertNoOverflow(page);
});

test("live crop ratio is preserved in the exported PNG", async ({ page }) => {
  await page.goto("/");
  await upload(page, [{ name: "crop-export.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Image Converter/i }).first().click();

  await page.getByRole("button", { name: "4:3", exact: true }).click();
  await page.getByLabel("FORMAT").selectOption("image/png");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const output = await fs.readFile(path!);

  expect(output.subarray(1, 4).toString("ascii")).toBe("PNG");
  const width = output.readUInt32BE(16);
  const height = output.readUInt32BE(20);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(width / height).toBeCloseTo(4 / 3, 1);
});

test("live editor stays usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await upload(page, [{ name: "mobile-live.png", mimeType: "image/png", buffer: png }]);
  await page.getByRole("button", { name: /Resize Image/i }).first().click();

  await expect(page.getByTestId("live-image-editor")).toBeVisible();
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await expect(page.getByTestId("crop-overlay")).toBeVisible();
  await assertNoOverflow(page);
});
