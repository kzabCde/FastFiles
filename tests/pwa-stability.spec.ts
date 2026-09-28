import { expect, test } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("service worker activation preserves an in-memory file session", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "pwa-session.png", mimeType: "image/png", buffer: png });
  const queue = page.getByTestId("file-queue");
  await expect(queue).toBeVisible();
  await expect(queue.getByText("pwa-session.png")).toBeVisible();
  const urlBefore = page.url();
  await page.evaluate(async () => { if ("serviceWorker" in navigator) await navigator.serviceWorker.ready; });
  await page.waitForTimeout(750);
  await expect(queue).toBeVisible();
  await expect(queue.getByText("pwa-session.png")).toBeVisible();
  expect(page.url()).toBe(urlBefore);
});
