import { expect, test } from "@playwright/test";

test("homepage displays three groups and preserves tool discovery in Thai and English", async ({ page }) => {
  await page.goto("/");
  const groups = page.locator("#tools .tool-category");
  await expect(groups).toHaveCount(3);
  await expect(groups.locator("h3")).toHaveText(["PDF Tools", "Image Tools", "Everyday File Tools"]);
  await expect(groups.nth(0).getByRole("button", { name: /Merge PDF/i })).toBeVisible();
  await expect(groups.nth(0).getByRole("button", { name: /Word to PDF/i })).toBeVisible();
  await expect(groups.nth(1).getByRole("button", { name: /Image Editor/i })).toBeVisible();
  await expect(groups.nth(2).getByRole("button", { name: "QR Generator" })).toBeVisible();
  await expect(page.locator("#tools .tool-card")).toHaveCount(19 - 1);

  await page.getByRole("button", { name: "TH", exact: true }).click();
  await expect(groups.locator("h3")).toHaveText([
    "เครื่องมือจัดการไฟล์ PDF",
    "เครื่องมือจัดการรูปภาพ",
    "เครื่องมือจัดการไฟล์ทั่วไป",
  ]);
});

test("desktop menu uses the same three headings and keeps QR inside general tools", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const menu = page.getByTestId("navigation-dropdown");
  await expect(menu.getByRole("heading", { level: 3 })).toHaveText(["PDF Tools", "Image Tools", "Everyday File Tools"]);
  await expect(menu.getByTestId("nav-qr-generator")).toHaveAttribute("href", "/qr");
  await expect(menu.locator('a[href^="/tools/"]')).toHaveCount(17);
});

test("mobile menu retains all three collapsible groups and the QR route", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open tools menu" }).click();
  const menu = page.getByTestId("navigation-dropdown");
  const groups = menu.getByRole("button", { name: /^(PDF Tools|Image Tools|Everyday File Tools)$/ });
  await expect(groups).toHaveCount(3);
  const general = menu.getByRole("button", { name: "Everyday File Tools" });
  await expect(menu.getByTestId("nav-qr-generator")).toBeVisible();
  await general.click();
  await expect(general).toHaveAttribute("aria-expanded", "false");
  await expect(menu.getByTestId("nav-qr-generator")).toHaveCount(0);
  await general.click();
  await menu.getByTestId("nav-qr-generator").click();
  await expect(page).toHaveURL(/\/qr$/);
});
