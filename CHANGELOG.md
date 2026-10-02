# Changelog

## Unreleased — Document conversion

### Added

- Local DOCX → PDF conversion with DOCX package validation plus a lazy-loaded `docx-preview` layout pass for Word page geometry, styles, tables, images, headers/footers, columns and page-break hints.
- Local rendered-DOM capture with `html2canvas`, followed by `pdf-lib` page assembly; the existing custom renderer remains as an explicitly reported compatibility fallback.
- PDF → Word **Preserve Layout** mode as the default. PDF.js renders each source page locally and FastFiles embeds it as a full-page anchored image in a matching Word section.
- PDF → Word **Editable** mode for text PDFs using text geometry, heading inference, simple-table heuristics, multi-column reading order, page breaks and best-effort image extraction.
- Preserve Layout support for image-only/scanned PDFs without OCR; Editable scan conversion remains OCR-dependent.
- DOCX file intake, Word/PDF converter routes, smart actions, quality analysis, cancellation, conversion-mode controls and explicit legacy `.doc` guidance.
- Unit and cross-browser Playwright coverage for high-fidelity Word rendering, default Preserve Layout, Editable reconstruction, scan preservation and legacy `.doc` rejection.

### Changed

- FastFiles file intake and queue recognize DOCX alongside PDF and image files.
- Document conversion remains browser-local and does not add a cloud conversion service, account, database or permanent file storage.
- Heavy DOCX rendering/capture libraries are loaded only when Word → PDF processing is requested.

### Known limitations

- Word → PDF output is page-rasterized after layout rendering, so selectable PDF text is not guaranteed and unsupported Word features can still differ from Microsoft Word.
- Preserve Layout PDF → Word keeps page appearance by embedding page images, so text inside those pages is not directly editable.
- Editable PDF → Word remains heuristic reconstruction and can differ on complex layouts.
- OCR is not bundled; it is required only when editable text is requested from scanned/image-only PDFs.

## 0.3.0 — 2026-09-28

### Added

- Image Editor V3 free crop, zoom/pan, Before/After, custom rotation, Undo/Redo, expanded resize/compression presets, and batch apply scope.
- Watermark V2 text/logo sources, normalized custom positioning, rotation, font weight, shadow intensity, and repeat mode.
- Lightweight PDF page viewer and advanced PDF watermark controls with validated page targeting.
- Contact/vCard QR payloads, center logos, and scan-safety warnings.
- Installable PWA manifest, versioned offline shell, and service-worker update handling.
- ESLint, Vitest, axe, mobile/tablet, and visual-regression test foundations.

### Changed

- PDF Organizer now supports click, Ctrl/Cmd, and Shift selection with a dedicated drag handle and visible insertion state.
- Navigation indicates the current tool and supports Escape, Arrow, Home, and End keyboard behavior.
- Playwright starts Next.js on an explicit loopback hostname for consistent local and CI behavior.
- PDF Metadata can edit Title, Author, Subject, Keywords, Creator, and Producer before exporting a new file.
- Dedicated tool routes now perform the same file integrity checks as the homepage before opening a workspace.
- The visible application version is read from package metadata instead of duplicated UI strings.
- Added selectable PDF text extraction with page ranges, preview, clipboard copy, and TXT download.
- Added browser-local scanned PDF compression with Balanced/Small presets, explicit flattening warnings, and before/after size comparison.

### Security and privacy

- User file processing remains browser-local.
- Service-worker caching is restricted to same-origin GET app resources and explicitly excludes Blob/Data URLs and non-HTTP schemes.

### Known limitations

- Encrypted PDFs cannot be edited.
- PDF compression is raster-based and intended for scans/image-heavy documents; selectable content and interactive structure are flattened.
- Browser memory limits vary by device and workload.
- AVIF export depends on browser Canvas support.
- QR customization cannot guarantee scanning in every environment.
- Offline use requires the necessary bundles to have been loaded online at least once.
