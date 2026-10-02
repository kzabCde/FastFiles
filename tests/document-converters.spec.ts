import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs/promises";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGOsOLGAARtgwio6aCUAei8B8F0+AyAAAAAASUVORK5CYII=",
  "base64",
);

async function makeDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>FastFiles document test</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>First page keeps editable DOCX content before PDF rendering.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="0A5A3A"/></w:rPr><w:t>ภาษาไทย ทดสอบการจัดรูปแบบเอกสาร</w:t><w:br w:type="page"/></w:r>
    </w:p>
    <w:p><w:r><w:t>Second page after an explicit Word page break.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Score</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Alice</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>95</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`);
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function makeTextPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const first = pdf.addPage([595.28, 841.89]);
  first.drawText("Editable FastFiles report", { x: 52, y: 770, size: 22, font: bold });
  first.drawText("This paragraph should become editable Word text.", { x: 52, y: 730, size: 11, font });
  first.drawText("Name", { x: 52, y: 680, size: 11, font: bold });
  first.drawText("Score", { x: 250, y: 680, size: 11, font: bold });
  first.drawText("Alice", { x: 52, y: 660, size: 11, font });
  first.drawText("95", { x: 250, y: 660, size: 11, font });
  const second = pdf.addPage([595.28, 841.89]);
  second.drawText("Second page text", { x: 52, y: 770, size: 16, font: bold });
  return Buffer.from(await pdf.save());
}

async function makeScannedPdf() {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(onePixelPng);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawImage(image, { x: 40, y: 120, width: 515, height: 600 });
  return Buffer.from(await pdf.save());
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator('input[type="file"]').setInputFiles(file);
}

test("Word to PDF converts a real DOCX locally and preserves page breaks", async ({ page }) => {
  await page.goto("/tools/word-to-pdf");
  await upload(page, { name: "document.docx", mimeType: DOCX_MIME, buffer: await makeDocx() });

  const workspace = page.getByTestId("word-to-pdf-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace).toContainText("FastFiles document test", { useInnerText: false }).catch(() => {});
  await expect(workspace.getByText(/High|Moderate/i)).toBeVisible();

  await workspace.getByRole("button", { name: /CONVERT TO PDF/i }).click();
  const result = page.getByTestId("result-center");
  await expect(result).toContainText("WORD → PDF COMPLETE", { timeout: 30_000 });
  await expect(result).toContainText(/Word layout renderer/i);

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("document.pdf");

  const path = await download.path();
  const output = await PDFDocument.load(await fs.readFile(path!));
  expect(output.getPageCount()).toBe(2);
});

test("PDF to Word defaults to Preserve Layout and keeps every page as a visual page", async ({ page }) => {
  await page.goto("/tools/pdf-to-word");
  await upload(page, { name: "layout.pdf", mimeType: "application/pdf", buffer: await makeTextPdf() });

  const workspace = page.getByTestId("pdf-to-word-workspace");
  const preserve = workspace.getByRole("radio", { name: /Preserve layout/i });
  await expect(preserve).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });

  await workspace.getByRole("button", { name: /CONVERT TO WORD/i }).click();
  const result = page.getByTestId("result-center");
  await expect(result).toContainText("PDF → WORD COMPLETE", { timeout: 30_000 });
  await expect(result).toContainText(/Preserve Layout/i);

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  const documentXml = await zip.file("word/document.xml")?.async("text");
  expect(documentXml?.match(/<wp:anchor/g)?.length).toBe(2);
  expect(zip.file("word/media/page-1.png")).not.toBeNull();
  expect(zip.file("word/media/page-2.png")).not.toBeNull();
});

test("PDF to Word creates an editable DOCX with reconstructed text", async ({ page }) => {
  await page.goto("/tools/pdf-to-word");
  await upload(page, { name: "editable.pdf", mimeType: "application/pdf", buffer: await makeTextPdf() });

  const workspace = page.getByTestId("pdf-to-word-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText(/Preserve layout/i)).toBeVisible({ timeout: 20_000 });
  await workspace.getByRole("radio", { name: /Editable/i }).click();
  await expect(workspace.getByRole("radio", { name: /Editable/i })).toHaveAttribute("aria-checked", "true");

  await workspace.getByRole("button", { name: /CONVERT TO WORD/i }).click();
  const result = page.getByTestId("result-center");
  await expect(result).toContainText("PDF → WORD COMPLETE", { timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("editable.docx");

  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  const documentXml = await zip.file("word/document.xml")?.async("text");
  expect(documentXml).toContain("Editable FastFiles report");
  expect(documentXml).toContain("This paragraph should become editable Word text.");
  expect(documentXml).toContain("Second page text");
  expect(documentXml).toContain('w:type="page"');
});

test("PDF to Word preserves image-only scans as full-page Word images", async ({ page }) => {
  await page.goto("/tools/pdf-to-word");
  await upload(page, { name: "scan.pdf", mimeType: "application/pdf", buffer: await makeScannedPdf() });

  const workspace = page.getByTestId("pdf-to-word-workspace");
  const preserve = workspace.getByRole("radio", { name: /Preserve layout/i });
  const editable = workspace.getByRole("radio", { name: /Editable/i });
  await expect(preserve).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });
  await expect(editable).toBeDisabled();
  await expect(workspace.getByRole("button", { name: /CONVERT TO WORD/i })).toBeEnabled();

  await workspace.getByRole("button", { name: /CONVERT TO WORD/i }).click();
  const result = page.getByTestId("result-center");
  await expect(result).toContainText("PDF → WORD COMPLETE", { timeout: 30_000 });
  await expect(result).toContainText(/Preserve Layout/i);

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download", exact: true }).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  const zip = await JSZip.loadAsync(await fs.readFile(path!));
  const documentXml = await zip.file("word/document.xml")?.async("text");
  expect(documentXml).toContain("<wp:anchor");
  expect(documentXml).toContain('relativeFrom="page"');
  expect(zip.file("word/media/page-1.png")).not.toBeNull();
});

test("legacy DOC files are rejected with a useful message", async ({ page }) => {
  await page.goto("/tools/word-to-pdf");
  await page.locator('input[type="file"]').setInputFiles({
    name: "legacy.doc",
    mimeType: "application/msword",
    buffer: Buffer.from("not-a-docx"),
  });
  await expect(page.locator(".error-panel[role=\"alert\"]")).toContainText(/Legacy \.doc files are not supported|ยังไม่รองรับไฟล์ \.doc/i);
});
