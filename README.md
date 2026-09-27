# FastFiles

**Drop. Edit. Done.**

FastFiles is a privacy-focused, local-first PDF and image utility built with Next.js and TypeScript. Add files first, then FastFiles validates what it can read and reveals actions that are compatible with the current selection.

## v0.2.0 — Reliability & Workflow Update

### File Intake V2

- Structured file queue with filename, type, size, page count/dimensions when available, status, remove action and drag reordering.
- Add more files without resetting the current queue through the picker, drag/drop or clipboard paste.
- Validation for zero-byte files, corrupted/invalid PDFs, corrupted images, unsupported formats, password-protected PDFs and image MIME/extension mismatches.
- Thai, emoji, spaces and special characters are preserved where the browser/file format allows them; generated download names are sanitized only for characters that are unsafe in filenames.
- Mixed PDF + image selections do not receive actions that would fail on that combination.
- Large-workload warning based on file count, total bytes and known PDF page counts. This is a safety warning, not a claimed browser file-size limit.

### PDF tools

- Merge PDF
- Organize PDF with progressive thumbnails, drag reorder, multi-select, rotate, delete, duplicate, extract, Select All, Undo/Redo and organizer-scoped keyboard shortcuts
- Split PDF / extract page ranges
- Add configurable page numbers
- PDF metadata viewer and supported text-metadata clearing
- Images → PDF
- PDF → PNG (ZIP export)
- PDF watermarking

Advanced PDF compression is intentionally **not** advertised in v0.2. The current `pdf-lib` architecture does not provide the kind of reliable content/image recompression expected from dedicated PDF optimizers; a future WASM-based implementation should be evaluated instead of presenting a fake compression button.

### Image tools

- JPG / PNG / WebP conversion
- AVIF output only when the current browser successfully reports support
- Live Canvas editing for Image Convert, Resize, Compress and image Watermark workflows
- Crop presets: Original, 1:1, 4:3, 3:4, 16:9 and 9:16, with draggable crop repositioning
- Live rotate, horizontal/vertical flip and text-watermark preview with adjustable opacity
- Preview uses a lightweight in-browser render while final export processes the original full-resolution source
- Batch filmstrip preview; the current edit settings are applied consistently to all selected images
- Resize presets: Original, 50%, 25%, 1080px, 1920px and custom dimensions
- Preserve-aspect-ratio control
- Quality-based compression with estimated size before export and actual size in Result Center
- Batch processing that keeps successful outputs even when another image fails
- Retry failed batch items
- Cancel between batch items without reloading the application

The current crop handles are visual guides. v0.2 supports preset aspect ratios plus drag-to-reposition; arbitrary freeform corner-resizing is intentionally not claimed yet. Codec-quality controls affect the actual exported file, while the live canvas focuses on geometric edits and watermark placement rather than pretending to reproduce exact compression artifacts before encoding.

### Result Center

Completed workflows keep their generated Blob results in the current in-memory session so users can:

- inspect output names and sizes
- download an individual result again
- download successful batch results as ZIP
- see partial-success failures without losing successful outputs
- retry failed image items
- change settings or start with new files

Original files and generated Blob results are not persisted by FastFiles after the page/session is discarded.

## Privacy model

Core processing happens in the browser. FastFiles does not require an account, does not use a database for user files and does not permanently store original user files. Theme and language preferences are stored locally in browser storage.

PDF rendering uses the `pdfjs-dist` worker bundled with the application rather than loading the worker from a third-party CDN. Static application assets can still be served by the hosting platform/CDN; the local-first claim refers to user-file processing, not to every network request made by the web app itself.

Image re-encoding uses browser Canvas APIs. Re-encoding commonly drops source metadata, but FastFiles does not claim that every metadata field is guaranteed to be removed across every browser and image format.

## Known limitations

- Password-protected PDFs are detected but cannot be unlocked in v0.2.
- PDF metadata clearing targets text fields supported by `pdf-lib`; document dates or other low-level metadata may remain.
- Browser memory limits vary by device, browser and file content. FastFiles intentionally does not publish an unverified maximum file size.
- AVIF export is hidden when the browser cannot produce a valid AVIF Blob.
- HEIC/HEIF export is not part of v0.2.
- Batch cancellation occurs between files; an individual Canvas/PDF operation that has already started may need to finish before cancellation takes effect.
- Live crop currently supports aspect-ratio presets and repositioning, not arbitrary freeform crop resizing.
- Codec quality changes are reflected in estimated/output size; the preview is not intended to simulate exact JPEG/WebP/AVIF compression artifacts before export.

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm run build
npm run test:e2e
```

Playwright is configured to verify Chromium, Firefox and WebKit. The current v0.2 suite runs 99 tests: 96 pass and 3 are intentional platform/smoke-test skips. Coverage includes File Queue intake/error states, mobile overflow, in-workspace TH/EN switching, partial batch retry, PDF page numbering, metadata handling, progressive PDF thumbnails, live image transforms, live crop UI and exported crop-ratio verification.

## Architecture

- `app/` — Next.js App Router shell and visual system
- `components/FastFilesApp.tsx` — landing, File Intake V2, discovery, theme/language
- `components/FileQueue.tsx` — queue status, add/remove/reorder UI
- `components/ToolWorkspace.tsx` — shared tool routing, PDF workspaces and processing states
- `components/LiveImageWorkspace.tsx` — live Canvas image editor, crop controls and batch preview
- `components/ResultCenter.tsx` — reusable single/batch output UI
- `lib/file-intake.ts` — local validation, queue summaries and workload checks
- `lib/pdf-tools.ts` — pdf-lib + bundled PDF.js rendering/processing
- `lib/image-tools.ts` — full-resolution Canvas image export, crop geometry and partial batch recovery
- `lib/tools.ts` — tool metadata, file detection and smart action filtering
- `lib/download.ts` — safe filenames, Blob downloads and ZIP creation

## Changelog

### 0.2.0

- Added File Intake V2 and resilient local validation.
- Added smart selection-aware tool suggestions.
- Added Result Center and partial batch recovery.
- Added PDF page numbering and metadata inspection/clearing.
- Expanded PDF organizer controls and keyboard support.
- Added a live Canvas image editor with crop presets/repositioning, rotate, flip and watermark preview.
- Added image resize presets, optional aspect-ratio unlock, runtime-gated AVIF and batch cancellation/retry.
- Added TH/EN switching inside active workspaces.
- Hardened generated downloads and filenames.
- Expanded Chromium, Firefox and WebKit QA for the v0.2 workflow.
- Clarified privacy, metadata, memory and PDF-compression limitations.

### 0.1.0

- Initial local-first PDF/image toolkit release.

## Product principle

**One drop. Multiple tools.**

v0.1 proved FastFiles can process files locally. v0.2 focuses on making that workflow dependable for everyday use.