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
  await page.getByRole("button", { name: /Image Converter/i }).first().click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Image Converter");
  await page.getByRole("button", { name: "Switch to Thai" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("แปลงไฟล์รูป");
  await expect(page.getByText("การตั้งค่า", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Image Converter");
});
