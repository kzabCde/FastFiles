import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations, result.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

async function makePdf() {
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  document.addPage([595, 842]);
  return Buffer.from(await document.save());
}

test("Home and grouped menu pass automated accessibility checks", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByTestId("navigation-dropdown")).toBeVisible();
  await expectAccessible(page);
});

test("Image Editor, Watermark, and Result Center pass accessibility checks", async ({ page }) => {
  await page.goto("/tools/image-convert");
  await page.locator('input[type="file"]').setInputFiles({ name: "a11y.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("live-image-editor")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  await expect(page.getByTestId("result-center")).toBeVisible();
  await expectAccessible(page);

  await page.goto("/tools/watermark");
  await page.locator('input[type="file"]').setInputFiles({ name: "watermark.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("watermark-image-editor")).toBeVisible();
  await expectAccessible(page);
});

test("PDF Organizer and QR Generator pass accessibility checks", async ({ page }) => {
  await page.goto("/tools/organize-pdf");
  await page.locator('input[type="file"]').setInputFiles({ name: "organize.pdf", mimeType: "application/pdf", buffer: await makePdf() });
  await expect(page.getByLabel("PDF organizer")).toBeVisible();
  await expectAccessible(page);
  await page.goto("/qr");
  await expect(page.getByTestId("qr-generator")).toBeVisible();
  await expectAccessible(page);
});
