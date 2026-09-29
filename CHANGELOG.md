# Changelog

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

### Security and privacy

- User file processing remains browser-local.
- Service-worker caching is restricted to same-origin GET app resources and explicitly excludes Blob/Data URLs and non-HTTP schemes.

### Known limitations

- Encrypted PDFs cannot be edited.
- Browser memory limits vary by device and workload.
- AVIF export depends on browser Canvas support.
- QR customization cannot guarantee scanning in every environment.
- Offline use requires the necessary bundles to have been loaded online at least once.
