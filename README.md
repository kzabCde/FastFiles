# FastFiles

**Drop. Edit. Done.**

FastFiles is a local-first browser utility for practical PDF, image, watermark, and QR workflows. Core file processing runs in the browser without requiring accounts or permanent cloud storage.

## FastFiles v0.3.0

### Image Editor

The primary image workflow combines conversion, resizing, compression, crop, rotate, and flip in one live editor.

- Live Canvas preview
- Freeform and preset crop ratios
- Zoom, pan, fit, 100%, and reset view
- Rotate left/right plus custom angle
- Horizontal / vertical flip
- Undo / redo
- Before / after comparison
- Resize presets and custom dimensions
- Compression presets and quality controls
- Batch filmstrip and Result Center
- Full-resolution export from the original source

### Image processing performance

FastFiles uses an accelerated browser-local export path when the browser supports it:

- Web Worker keeps heavy image decode / transform / encode work off the UI thread
- OffscreenCanvas performs crop, resize, rotate, flip, conversion, and compression without blocking editor interaction
- one reusable worker is used for a batch to avoid repeated worker startup cost
- batch processing remains sequential to limit peak memory use on very large images
- ImageBitmap resources and worker instances are explicitly released after processing
- cancellation continues to work through the existing AbortSignal flow
- browsers without the required Worker / OffscreenCanvas support automatically use the existing Canvas fallback
- Watermark exports currently continue to use the established Canvas renderer so live preview and full-resolution export geometry remain consistent

The accelerated path does not upload user images. Processing remains local to the browser.

### Watermark

Watermark is a dedicated tool separate from Image Editor.

- Text watermark
- Image / logo watermark
- 9 anchored positions plus custom drag position
- Relative size, margin, opacity, color, rotation, weight, and shadow
- Single and repeated/tiled watermark modes
- Normalized positioning so live preview and full-resolution export use the same geometry model

### PDF tools

- Merge PDF
- Organize / reorder PDF pages
- Split and extract pages
- Add page numbers
- PDF metadata viewer / supported text metadata clearing
- Images to PDF
- PDF to images
- PDF watermark
- Lightweight PDF page preview

### QR Generator

The QR Generator runs locally in the browser and supports:

- Text
- Website / URL
- Phone
- Email
- SMS
- Wi-Fi
- Contact / vCard
- Error-correction controls
- Foreground / background customization
- Optional center logo
- PNG and SVG export
- Copy image / encoded content
- scan-safety warnings for low contrast, insufficient quiet zone, and aggressive logo settings

### Navigation and dedicated pages

Tools are grouped in the FastFiles dropdown navigation:

- File Tools
- Image Tools
- QR Code

Primary Image Tools are intentionally reduced to:

1. **Image Editor**
2. **Watermark**

Legacy resize / compression routes remain available for backwards compatibility but are not presented as separate primary tools.

## Local-first privacy model

FastFiles does not require an account for core workflows. PDF, image, watermark, and QR operations are designed to execute in the browser.

The PWA service worker caches application shell/static resources only. User-selected files and generated outputs are not intentionally stored in the service-worker cache.

## PWA

FastFiles includes an installable web-app manifest and offline application shell.

Core goals:

- standalone install where supported
- cached application shell
- no service-worker caching of user-selected files or generated output blobs
- graceful fallback when service workers are unavailable

## Browser support

The automated browser matrix covers:

- Chromium
- Firefox
- WebKit
- mobile Chromium viewport
- tablet Chromium viewport

Browser capabilities such as AVIF encoding, clipboard image writing, OffscreenCanvas, and some PWA features are detected at runtime and use safe fallbacks where available.

## Quality gates

The repository includes automated checks for:

- TypeScript
- ESLint
- unit tests
- production build
- Playwright browser workflows
- mobile / tablet behavior
- axe accessibility checks
- visual regression surfaces

## Known limitations

- Password-protected / encrypted PDFs are not currently editable.
- Browser memory and maximum Canvas dimensions vary by device and browser.
- Very large PDFs and very high-resolution image batches may still reach device memory limits even with browser-local processing safeguards.
- AVIF export depends on browser Canvas encoding support.
- QR customization cannot guarantee successful scanning in every camera, print, lighting, or display environment.
- PDF compression is not advertised as a fake lossless feature; available PDF operations focus on deterministic document editing workflows.
- Worker/OffscreenCanvas acceleration is capability-gated; unsupported browsers use the established main-thread Canvas fallback.

## Architecture

Key areas include:

- `components/FastFilesApp.tsx` — home intake and product shell
- `components/StandaloneToolPage.tsx` — dedicated file-tool pages
- `components/ToolWorkspace.tsx` — PDF/image workspace routing
- `components/LiveImageWorkspace.tsx` — live Image Editor
- `components/ResultCenter.tsx` — shared output/retry/download UI
- `components/QRGenerator.tsx` — QR generation workspace
- `components/NavigationMenu.tsx` — grouped navigation
- `lib/file-intake.ts` — file validation and workload inspection
- `lib/image-tools.ts` — full-resolution image processing and browser fallback
- `lib/image-worker-client.ts` — accelerated image worker lifecycle and safe fallback
- `workers/image-processor.worker.ts` — OffscreenCanvas image transform/encoding worker
- `lib/pdf-tools.ts` — PDF processing and PDF.js rendering helpers

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

For the full release gate, also run the accessibility and visual checks defined by the repository workflows.
