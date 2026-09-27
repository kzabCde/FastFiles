import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");

async function makePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  pdf.addPage([595.28, 841.89]);
  return Buffer.from(await pdf.save());
}

test("core controls expose accessible names and keyboard focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "FastFiles home" })).toBeVisible();
  await expect(page.getByLabel("Theme")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", /pdf/i);

  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
  expect(["button", "a", "select", "input"]).toContain(focusedTag);
});

test("queue remove and reorder controls have accessible names", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "accessible.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: /Drag to reorder accessible\.png/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Remove file: accessible\.png/i })).toBeVisible();
});

test("PDF organizer is keyboard focusable and scoped shortcuts work", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "keyboard.pdf", mimeType: "application/pdf", buffer: await makePdf() });
  await page.getByRole("button", { name: /Organize PDF/i }).first().click();
  const organizer = page.getByLabel("PDF organizer");
  await organizer.focus();
  await expect(organizer).toBeFocused();
  await page.keyboard.press("Control+A");
  await expect(page.locator(".page-card.selected")).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(page.locator(".page-card")).toHaveCount(2);
});
