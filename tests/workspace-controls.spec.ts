import { expect, test } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=",
  "base64",
);

test("language can switch after entering an image workspace", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "workspace-language.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: /Image Editor/i }).first().click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Image Editor");
  await page.getByRole("button", { name: "Switch to Thai" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("แก้ไขรูปภาพ");
  await expect(page.getByText("การตั้งค่า", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Image Editor");
});

test("standalone PDF routes reject a corrupted file before opening the workspace", async ({ page }) => {
  await page.goto("/tools/pdf-metadata");
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-broken"),
  });

  await expect(page.locator(".error-panel[role='alert']")).toContainText(/broken\.pdf.*corrupted|broken\.pdf.*เสียหาย/i);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PDF Metadata");
  await expect(page.getByText("PDF METADATA", { exact: true })).toHaveCount(0);
});
