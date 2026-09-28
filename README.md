# FastFiles

**Drop. Edit. Done.**

FastFiles is a privacy-focused, local-first PDF, image and QR utility built with Next.js and TypeScript. File tools validate what the browser can read and reveal compatible actions; QR codes can be generated immediately without uploading a file.

## FastFiles v0.3.0 — Editing Experience & Product Quality

FastFiles v0.3.0 turns the existing local-first tools into a more complete browser productivity workspace without adding accounts, databases, permanent file storage, or unnecessary uploads.

### Highlights

- **Image Editor V3** — full-resolution export backed by a lightweight live preview, freeform/preset crop, eight resize handles, zoom/pan, 90° and custom rotation, flip, Before/After, Reset, and state-only Undo/Redo.
- **Resize and compression** — Original/25%/50%/75%/1080px/1920px/1440p/4K presets, custom dimensions, aspect lock, four quality presets, estimated pre-export size, and actual Result Center metrics.
- **Watermark V2** — text or PNG/JPG/WebP logo watermark, nine presets or normalized drag positioning, size, opacity, rotation, color, weight, shadow intensity, margin, and tiled repeat mode.
- **Batch images** — filmstrip preview with All/Selected/Current scope, partial-success reporting, ZIP download, cancellation between files, and retry of failed items.
- **PDF Organizer V3** — click/Ctrl/Cmd/Shift selection, contextual bulk actions, dedicated drag handles, insertion feedback, Undo/Redo, and progressive thumbnails.
- **PDF Preview** — previous/next page, page entry, zoom, 100%, Fit Width, Fit Page, and focused Left/Right keyboard navigation.
- **PDF Watermark V2** — color, size, opacity, rotation, nine positions, and All/Odd/Even/validated custom page targeting.
- **QR Generator V2** — Text, Website, Wi-Fi, Email, Phone, SMS, and vCard Contact payloads; optional PNG/WebP center logo; automatic correction-H selection and contrast/margin/logo safety warnings.
- **Installable PWA** — versioned app-shell caching and update handling. The service worker does not cache Blob/Data URLs, uploads, generated outputs, or QR payloads.
- **Quality gate** — TypeScript, ESLint, Vitest, production build, Chromium/Firefox/WebKit plus mobile/tablet projects, axe accessibility checks, and stable Playwright visual snapshots.

Core processing stays in the browser. Legacy Resize and Compress routes remain compatible and continue into the consolidated Image Editor.

### Image Editor performance acceleration — v0.3.1 hotfix

The v0.3.1 stability work adds a capability-gated accelerated export path for the Image Editor:

- crop, resize, rotate, flip, format conversion, and compression can run in a dedicated Web Worker instead of blocking the UI thread
- supported browsers use `OffscreenCanvas` plus `createImageBitmap` for full-resolution transform and encode work
- a single worker session is reused across a batch to avoid repeated worker startup overhead
- batch items remain sequential, which reduces peak decoded-image/canvas memory for high-resolution files
- existing progress callbacks and `AbortSignal` cancellation remain intact
- `ImageBitmap` resources and worker instances are explicitly released after use
- if Worker/OffscreenCanvas/worker encoding is unavailable, FastFiles automatically falls back to the existing Canvas renderer
- Watermark export intentionally stays on the established Canvas path for now so live preview and full-resolution watermark geometry keep using the same renderer

This acceleration remains fully local to the browser and does not upload images.

## v0.2.1 — QR Generator, Dedicated Routes & Focused Image Tools

### Grouped navigation

- The burger opens a responsive dropdown below the header.
- Tools are grouped into **File Tools**, **Image Tools** and **QR Code**.
- File/image menu entries open dedicated website routes instead of an in-page drawer workspace.
- The homepage universal drag/drop workflow remains available.
- Privacy and About remain reachable from the dropdown.

### Focused Image Tools

The Image Tools group is intentionally reduced to two primary workflows:

1. **Image Editor** — conversion, resize, compression, crop, rotate and flip are handled in one live Canvas workspace.
2. **Watermark** — a separate focused workflow for adding text watermarks with a live preview.

Legacy `/tools/image-resize` and `/tools/image-compress` routes are kept internally for compatibility, but they are no longer advertised in navigation or smart tool search because those controls already exist in Image Editor.

The Watermark image workspace now supports:

- live watermark preview
- 9 placement presets: corners, edges and center
- text color
- relative text size
- opacity
- edge margin
- optional text shadow for readability
- batch application to selected images
- output format and quality controls
- full-resolution export using the same watermark renderer as the preview

### QR Generator

QR generation is performed locally in the browser using the `qrcode` package. FastFiles does not send QR content to a FastFiles backend.

Supported content types:

- Text
- URL
- Phone
- Email with optional subject/body
- SMS with message
- Wi-Fi with WPA/WPA2/WPA3-compatible payload, WEP or open-network mode, plus hidden-network flag

QR controls:

- Live preview
- Output size
- Margin
- Error correction levels L / M / Q / H
- Foreground and background colors
- Download PNG
- Download SVG
- Copy encoded content
- Copy QR image when the browser clipboard API supports PNG image writes

The QR workspace supports Thai/English UI, Light/Dark/System themes and responsive mobile/desktop layouts.

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

### Image processing engine

- JPG / PNG / WebP conversion
- AVIF output only when the current browser successfully reports support
- Live Canvas editing
- Crop presets: Original, 1:1, 4:3, 3:4, 16:9 and 9:16, with draggable crop repositioning
- Live rotate and horizontal/vertical flip
- Preview uses a lightweight in-browser render while final export processes the original full-resolution source
- Batch filmstrip preview; current settings are applied consistently to all selected images
- Resize presets: Original, 50%, 25%, 1080px, 1920px and custom dimensions
- Preserve-aspect-ratio control
- Quality-based compression with estimated size before export and actual size in Result Center
- Batch processing that keeps successful outputs even when another image fails
- Retry failed batch items
- Cancel between batch items without reloading the application

Codec-quality controls affect the actual exported file, while the live canvas focuses on geometric edits rather than pretending to reproduce exact JPEG/WebP/AVIF compression artifacts before encoding.

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

Core processing happens in the browser. FastFiles does not require an account, does not use a database for user files or QR content and does not permanently store original user files. Theme and language preferences are stored locally in browser storage.

PDF rendering uses the `pdfjs-dist` worker bundled with the application rather than loading the worker from a third-party CDN. Static application assets and JavaScript dependencies can still be served by the hosting platform/CDN; the local-first claim refers to user-file and QR-content processing, not to every network request made by the web app itself.

Image re-encoding uses browser Canvas APIs. Re-encoding commonly drops source metadata, but FastFiles does not claim that every metadata field is guaranteed to be removed across every browser and image format.

## Known limitations

- Password-protected PDFs are detected but cannot be unlocked.
- PDF metadata clearing targets text fields supported by `pdf-lib`; document dates or other low-level metadata may remain.
- Browser memory limits vary by device, browser and file content. FastFiles intentionally does not publish an unverified maximum file size.
- AVIF export is hidden when the browser cannot produce a valid AVIF Blob.
- HEIC/HEIF export is not currently supported.
- Batch cancellation occurs between files; an individual Canvas/PDF operation that has already started may need to finish before cancellation takes effect.
- Extremely large images or PDFs can exceed device/browser memory despite progressive rendering and workload warnings.
- Custom image rotation expands the image bounds; transparent corners become white when exporting JPEG.
- PDF watermark preview shows the source document viewer; the exact applied watermark is visible after export.
- QR styling and logos cannot guarantee successful scanning across every camera, print surface, lighting condition, or damage level.
- Offline use requires one successful online load of the relevant app bundles first.
- Codec quality changes are reflected in estimated/output size; the preview is not intended to simulate exact JPEG/WebP/AVIF compression artifacts before export.
- Copying a QR image depends on browser support for writing PNG blobs to the Clipboard API; PNG/SVG downloads remain available when image clipboard writes are unavailable.
- Worker/OffscreenCanvas acceleration is capability-gated; unsupported browsers use the established main-thread Canvas fallback.

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

`npm run quality` runs the complete local release gate. Playwright covers Chromium, Firefox, WebKit, 390 × 844 mobile, and tablet projects. Dedicated suites cover accessibility and visual regression.

## Architecture

- `app/` — Next.js App Router shell and dedicated tool routes
- `components/FastFilesApp.tsx` — landing, File Intake V2, discovery and theme/language state
- `components/NavigationMenu.tsx` — grouped File/Image/QR dropdown navigation
- `components/StandaloneToolPage.tsx` — dedicated file/image route intake shell
- `components/QRGenerator.tsx` — local QR payload building, live preview and PNG/SVG export
- `components/FileQueue.tsx` — queue status, add/remove/reorder UI
- `components/ToolWorkspace.tsx` — shared tool routing, PDF workspaces and processing states
- `components/LiveImageWorkspace.tsx` — consolidated live Image Editor plus focused image Watermark mode
- `components/ResultCenter.tsx` — reusable single/batch output UI
- `lib/file-intake.ts` — local validation, queue summaries and workload checks
- `lib/pdf-tools.ts` — pdf-lib + bundled PDF.js rendering/processing
- `lib/image-tools.ts` — full-resolution Canvas export, crop geometry, watermark rendering, worker acceleration and partial batch recovery
- `lib/image-worker-client.ts` — browser capability detection and accelerated worker lifecycle
- `workers/image-processor.worker.ts` — OffscreenCanvas image transform and encoding worker
- `lib/tools.ts` — tool metadata, legacy compatibility, file detection and smart action filtering
- `lib/download.ts` — safe filenames, Blob downloads and ZIP creation

## Changelog

### 0.3.1 (in progress)

- Added capability-gated Web Worker + OffscreenCanvas acceleration for Image Editor export and batch processing.
- Kept a safe Canvas fallback for unsupported browsers and Watermark rendering.

### 0.3.0

- Added Image Editor V3 editing, view, history, resize, compression, and batch-scope controls.
- Added text/image Watermark V2 with normalized preview/export geometry and repeat mode.
- Added lightweight PDF Preview and expanded PDF watermark page/style controls.
- Improved PDF organizer selection and drag affordances.
- Added Contact QR, center logos, and QR readability warnings.
- Added PWA manifest, offline app-shell service worker, and update handling.
- Added lint/unit/accessibility/mobile/visual quality-gate foundations.

### 0.2.1

- Added dropdown navigation with dedicated tool routes.
- Reduced Image Tools to **Image Editor** and **Watermark**.
- Consolidated convert, resize and compress discovery into Image Editor while keeping legacy routes compatible.
- Expanded text watermarking with live 9-position placement, color, size, opacity, margin and shadow controls.
- Added a browser-local QR Generator for Text, URL, Phone, Email, SMS and Wi-Fi.
- Added live QR size, margin, correction-level and color controls.
- Added QR PNG/SVG export and clipboard actions.
- Expanded image, watermark, navigation and QR cross-browser E2E coverage.

### 0.2.0

- Added File Intake V2 and resilient local validation.
- Added smart selection-aware tool suggestions.
- Added Result Center and partial batch recovery.
- Added PDF page numbering and metadata inspection/clearing.
- Expanded PDF organizer controls and keyboard support.
- Added a live Canvas image editor with crop presets/repositioning, rotate and flip.
- Added image resize presets, optional aspect-ratio unlock, runtime-gated AVIF and batch cancellation/retry.
- Added TH/EN switching inside active workspaces.
- Hardened generated downloads and filenames.
- Expanded Chromium, Firefox and WebKit QA for the v0.2 workflow.
- Clarified privacy, metadata, memory and PDF-compression limitations.

### 0.1.0

- Initial local-first PDF/image toolkit release.

## Product principle

**One drop. Multiple tools.**

FastFiles continues to prioritize dependable local workflows over adding server-side complexity.
