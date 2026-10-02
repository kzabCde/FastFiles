# Changelog

## Unreleased — Document conversion

### Added

- Local DOCX → PDF conversion with DOCX package validation, page geometry, common text formatting, page breaks, simple tables, embedded images, headers/footers, progress reporting, and cancellation.
- Local text-based PDF → editable DOCX reconstruction using PDF.js text geometry, heading inference, simple-table heuristics, multi-column reading order, page breaks, and best-effort image extraction.
- DOCX file intake, Word/PDF converter routes, smart actions, quality analysis, and explicit legacy `.doc` guidance.
- Scan detection that blocks misleading empty DOCX output when OCR is required.
- Unit and cross-browser Playwright coverage for the new document converters.

### Changed

- FastFiles file intake and queue now recognize DOCX alongside PDF and image files.
- Document conversion reuses the existing local-first JSZip, PDF.js, and pdf-lib stack without adding a cloud conversion service or database.

### Known limitations

- Word → PDF uses page rasterization to favor visual fidelity, so selectable PDF text is not guaranteed.
- Scanned PDF → Word requires OCR and is reported as unsupported rather than silently generating an empty Word file.
- Complex Word/PDF layout reconstruction remains best-effort.

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
