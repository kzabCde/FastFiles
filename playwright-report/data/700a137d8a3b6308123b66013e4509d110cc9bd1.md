# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-regression.spec.ts >> @visual stable editor, watermark, organizer, and result surfaces
- Location: tests/visual-regression.spec.ts:19:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  14 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: pdf-organizer.png

Call log:
  - Expect "toHaveScreenshot(pdf-organizer.png)" with timeout 20000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 14 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 14 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - alert [ref=f2e2]
  - generic [ref=f2e3]:
    - generic [ref=f2e4]:
      - button "← TOOLS" [ref=f2e5] [cursor=pointer]
      - generic [ref=f2e6]:
        - generic [ref=f2e7]: FASTFILES / ORGANIZE
        - heading "Organize PDF" [level=1] [ref=f2e8]
      - generic [ref=f2e9]:
        - button "Switch to Thai" [ref=f2e10] [cursor=pointer]: TH
        - button "NEW FILES" [ref=f2e11] [cursor=pointer]
    - generic "PDF organizer" [ref=f2e12]:
      - generic [ref=f2e13]:
        - generic [ref=f2e14]:
          - strong [ref=f2e15]: organizer.pdf
          - generic [ref=f2e16]: 2 pages · 589 B · 0 selected
        - generic [ref=f2e17]:
          - button "UNDO" [disabled] [ref=f2e18]
          - button "REDO" [disabled] [ref=f2e19]
          - button "SELECT ALL" [ref=f2e20] [cursor=pointer]
          - button "DESELECT" [disabled] [ref=f2e21]
          - button "ROTATE" [disabled] [ref=f2e22]
          - button "DUPLICATE" [disabled] [ref=f2e23]
          - button "EXTRACT" [disabled] [ref=f2e24]
          - button "DELETE" [disabled] [ref=f2e25]
          - button "EXPORT PDF ↗" [ref=f2e26] [cursor=pointer]
      - generic [ref=f2e27]:
        - generic [ref=f2e28]:
          - button "Select page 1" [ref=f2e29] [cursor=pointer]:
            - img "Page 1" [ref=f2e31]
            - generic [ref=f2e32]: "01"
          - button "Drag to reorder page 1" [ref=f2e33]: ⋮⋮
        - generic [ref=f2e34]:
          - button "Select page 2" [ref=f2e35] [cursor=pointer]:
            - img "Page 2" [ref=f2e37]
            - generic [ref=f2e38]: "02"
          - button "Drag to reorder page 2" [ref=f2e39]: ⋮⋮
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { PDFDocument } from "pdf-lib";
  3  | 
  4  | const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=", "base64");
  5  | 
  6  | test.skip(({ browserName }) => browserName !== "chromium", "Visual baselines are recorded in Chromium.");
  7  | 
  8  | test("@visual stable desktop surfaces", async ({ page }) => {
  9  |   await page.setViewportSize({ width: 1440, height: 1000 });
  10 |   await page.goto("/");
  11 |   await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true, animations: "disabled" });
  12 |   await page.getByRole("button", { name: "Open tools menu" }).click();
  13 |   await expect(page).toHaveScreenshot("menu-desktop.png", { fullPage: true, animations: "disabled" });
  14 |   await page.goto("/qr");
  15 |   await expect(page.getByTestId("qr-preview")).toBeVisible();
  16 |   await expect(page).toHaveScreenshot("qr-desktop.png", { fullPage: true, animations: "disabled" });
  17 | });
  18 | 
  19 | test("@visual stable editor, watermark, organizer, and result surfaces", async ({ page }) => {
  20 |   await page.setViewportSize({ width: 1440, height: 1000 });
  21 |   await page.goto("/tools/image-convert");
  22 |   await page.locator('input[type="file"]').setInputFiles({ name: "visual.png", mimeType: "image/png", buffer: png });
  23 |   await expect(page.getByTestId("live-image-editor")).toBeVisible();
  24 |   await expect(page).toHaveScreenshot("image-editor.png", { fullPage: true, animations: "disabled" });
  25 |   await page.getByRole("button", { name: /PROCESS IMAGE/i }).click();
  26 |   await expect(page.getByTestId("result-center")).toBeVisible();
  27 |   await expect(page).toHaveScreenshot("result-center.png", { fullPage: true, animations: "disabled" });
  28 |   await page.goto("/tools/watermark");
  29 |   await page.locator('input[type="file"]').setInputFiles({ name: "watermark.png", mimeType: "image/png", buffer: png });
  30 |   await expect(page.getByTestId("watermark-image-editor")).toBeVisible();
  31 |   await expect(page).toHaveScreenshot("watermark.png", { fullPage: true, animations: "disabled" });
  32 |   const document = await PDFDocument.create(); document.addPage([595, 842]); document.addPage([595, 842]);
  33 |   await page.goto("/tools/organize-pdf");
  34 |   await page.locator('input[type="file"]').setInputFiles({ name: "organizer.pdf", mimeType: "application/pdf", buffer: Buffer.from(await document.save()) });
  35 |   await expect(page.getByLabel("PDF organizer")).toBeVisible();
  36 |   await expect(page.locator(".page-thumb img")).toHaveCount(2);
> 37 |   await expect(page).toHaveScreenshot("pdf-organizer.png", { fullPage: true, animations: "disabled", mask: [page.locator(".page-thumb img")] });
     |                      ^ Error: expect(page).toHaveScreenshot(expected) failed
  38 | });
  39 | 
  40 | test("@visual stable mobile home and menu", async ({ page }) => {
  41 |   await page.setViewportSize({ width: 390, height: 844 });
  42 |   await page.goto("/");
  43 |   await expect(page).toHaveScreenshot("home-mobile.png", { fullPage: true, animations: "disabled" });
  44 |   await page.getByRole("button", { name: "Open tools menu" }).click();
  45 |   await expect(page).toHaveScreenshot("menu-mobile.png", { fullPage: true, animations: "disabled" });
  46 | });
  47 | 
```