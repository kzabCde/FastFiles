import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");

test.skip(({ browserName }) => browserName !== "chromium", "Visual baselines are recorded in Chromium.");

test("@visual stable desktop surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Open tools menu" }).click();
  await expect(page).toHaveScreenshot("menu-desktop.png", { fullPage: true, animations: "disabled" });
  await page.goto("/qr");
  await expect(page.getByTestId("qr-preview")).toBeVisible();
  await expect(page).toHaveScreenshot("qr-desktop.png", { fullPage: true, animations: "disabled" });
});

test("@visual stable editor, watermark, organizer, and result surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tools/image-convert");
  await page.locator('input[type="file"]').setInputFiles({ name: "visual.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("live-image-editor")).toBeVisible();
  await expect(page).toHaveScreenshot("image-editor.png", { fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  await expect(page.getByTestId("result-center")).toBeVisible();
  await expect(page).toHaveScreenshot("result-center.png", { fullPage: true, animations: "disabled" });
  await page.goto("/tools/watermark");
  await page.locator('input[type="file"]').setInputFiles({ name: "watermark.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("watermark-image-editor")).toBeVisible();
  await expect(page).toHaveScreenshot("watermark.png", { fullPage: true, animations: "disabled" });
  const document = await PDFDocument.create(); document.addPage([595, 842]); document.addPage([595, 842]);
  await page.goto("/tools/organize-pdf");
  await page.locator('input[type="file"]').setInputFiles({ name: "organizer.pdf", mimeType: "application/pdf", buffer: Buffer.from(await document.save()) });
  await expect(page.getByLabel("PDF organizer")).toBeVisible();
  await expect(page).toHaveScreenshot("pdf-organizer.png", { fullPage: true, animations: "disabled" });
});

test("@visual stable mobile home and menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveScreenshot("home-mobile.png", { fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Open tools menu" }).click();
  await expect(page).toHaveScreenshot("menu-mobile.png", { fullPage: true, animations: "disabled" });
});
