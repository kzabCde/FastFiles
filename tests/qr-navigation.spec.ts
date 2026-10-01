import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";

async function openQr(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const menuButton = page.getByRole("button", { name: "Tools", exact: true });
  await menuButton.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(500);
  await menuButton.click();
  const dropdown = page.getByTestId("navigation-dropdown");
  await expect(dropdown).toBeVisible();
  await dropdown.getByRole("link", { name: /QR Generator/i }).click();
  await expect(page).toHaveURL(/\/qr$/);
  await expect(page.getByTestId("qr-generator")).toBeVisible();
}

async function assertNoOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
}

test("desktop Tools tab opens a dropdown with categories and QR groups", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open tools menu" })).toBeHidden();
  const menu = page.getByRole("button", { name: "Tools", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");

  const dropdown = page.getByTestId("navigation-dropdown");
  await expect(dropdown).toBeVisible();
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const dropdownBox = await dropdown.boundingBox();
  expect(dropdownBox?.x ?? -1).toBeLessThanOrEqual(1);
  expect(dropdownBox?.width ?? 0).toBeGreaterThanOrEqual(viewportWidth - 1);
  await expect(dropdown.getByRole("heading", { name: "Edit & Organize" })).toBeVisible();
  await expect(dropdown.getByRole("heading", { name: "Convert" })).toBeVisible();
  await expect(dropdown.getByRole("heading", { name: "Enhance" })).toBeVisible();
  await expect(dropdown.getByRole("heading", { name: "QR Code" })).toBeVisible();
  await expect(dropdown.getByRole("link", { name: /Merge PDF/i })).toBeVisible();
  await expect(dropdown.getByRole("link", { name: /^Image Editor$/i })).toBeVisible();
  await expect(dropdown.getByRole("link", { name: /^Watermark$/i })).toBeVisible();
  await expect(dropdown.getByRole("link", { name: /Resize Image/i })).toHaveCount(0);
  await expect(dropdown.getByRole("link", { name: /Compress Image/i })).toHaveCount(0);
  await expect(dropdown.getByRole("link", { name: /QR Generator/i })).toBeVisible();

  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(dropdown).toHaveCount(0);
});

test("file and image menu items open dedicated pages", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByTestId("navigation-dropdown").getByRole("link", { name: "Merge PDF" }).click();
  await expect(page).toHaveURL(/\/tools\/merge-pdf$/);
  await expect(page.getByRole("heading", { level: 1, name: "Merge PDF" })).toBeVisible();
  await expect(page.getByTestId("standalone-tool-dropzone")).toBeVisible();

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByTestId("navigation-dropdown").getByRole("link", { name: "Image Editor" }).click();
  await expect(page).toHaveURL(/\/tools\/image-convert$/);
  await expect(page.getByRole("heading", { level: 1, name: "Image Editor" })).toBeVisible();
  await expect(page.getByTestId("standalone-tool-dropzone")).toBeVisible();
});

test("QR generator creates a live URL preview", async ({ page }) => {
  await openQr(page);
  const preview = page.getByTestId("qr-preview");
  await expect(preview).toBeVisible();
  const before = await preview.getAttribute("src");
  await page.getByLabel("Website URL").fill("https://example.com/fastfiles");
  await expect(page.getByTestId("qr-payload")).toHaveText("https://example.com/fastfiles");
  await expect.poll(() => preview.getAttribute("src")).not.toBe(before);
});

test("QR generator builds a Wi-Fi payload", async ({ page }) => {
  await openQr(page);
  await page.getByRole("button", { name: "Wi-Fi", exact: true }).click();
  await page.getByLabel("Network name (SSID)").fill("FastFiles WiFi");
  await page.getByLabel("Password").fill("local-only-123");
  await expect(page.getByTestId("qr-payload")).toContainText("WIFI:T:WPA;S:FastFiles WiFi;P:local-only-123;H:false;;");
  await expect(page.getByTestId("qr-preview")).toBeVisible();
});

test("QR PNG and SVG downloads are valid non-empty files", async ({ page }) => {
  await openQr(page);

  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOWNLOAD PNG" }).click();
  const pngDownload = await pngPromise;
  expect(pngDownload.suggestedFilename()).toBe("fastfiles-qr.png");
  const pngPath = await pngDownload.path();
  const png = await fs.readFile(pngPath!);
  expect(png.length).toBeGreaterThan(100);
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");

  const svgPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOWNLOAD SVG" }).click();
  const svgDownload = await svgPromise;
  expect(svgDownload.suggestedFilename()).toBe("fastfiles-qr.svg");
  const svgPath = await svgDownload.path();
  const svg = await fs.readFile(svgPath!, "utf8");
  expect(svg).toContain("<svg");
});

test("QR color customization updates the live preview", async ({ page }) => {
  await openQr(page);
  const preview = page.getByTestId("qr-preview");
  const before = await preview.getAttribute("src");
  await page.getByLabel("Foreground").evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "#0055aa");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(preview).toHaveAttribute("data-foreground", "#0055aa");
  await expect.poll(() => preview.getAttribute("src")).not.toBe(before);
});

test("QR workspace supports Thai and dark mode", async ({ page }) => {
  await openQr(page);
  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to Thai" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("สร้าง QR Code");
  await expect(page.getByText(/ประมวลผลในเครื่อง/).first()).toBeVisible();
});

test("dropdown and QR generator remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open tools menu" }).click();
  const dropdown = page.getByTestId("navigation-dropdown");
  await expect(dropdown).toBeVisible();
  await assertNoOverflow(page);
  const qrLink = dropdown.getByTestId("nav-qr-generator");
  await qrLink.scrollIntoViewIfNeeded();
  await expect(qrLink).toBeVisible();
  await expect(qrLink).toHaveAccessibleName("QR Generator");
  await qrLink.click();
  await expect(page).toHaveURL(/\/qr$/);
  await expect(page.getByTestId("qr-generator")).toBeVisible();
  await expect(page.getByTestId("qr-preview")).toBeVisible();
  await assertNoOverflow(page);
});

