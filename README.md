# FastFiles

**Drop. Edit. Done.**

FastFiles is a privacy-focused, local-first PDF and image utility built with Next.js and TypeScript. The product is designed around a single universal drop surface: add files first, then FastFiles reveals the relevant actions for those files.

## V0.1 tools

- Merge PDF
- Organize PDF (visual thumbnails, reorder, rotate, delete, extract, undo/redo)
- Split PDF / extract page ranges
- Images → PDF
- PDF → PNG (ZIP export)
- Image convert (JPG / PNG / WebP)
- Image resize / square crop / rotate / flip
- Image compression and quality control
- PDF and image watermarking
- Batch image processing with ZIP export
- Light / dark / system themes
- English / Thai interface toggle
- Command-style tool search

## Privacy model

Core processing happens in the browser. FastFiles does not require an account and the application does not persist original user files. Preferences such as theme and language are stored locally.

> PDF.js currently loads its matching worker bundle from unpkg while all user file bytes remain local. If you need a fully offline build, self-host the matching `pdf.worker.min.mjs` asset and update `lib/pdf-tools.ts`.

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
```

## Architecture

- `app/` — Next.js App Router shell and visual system
- `components/FastFilesApp.tsx` — landing, drop experience, discovery, theme/language
- `components/ToolWorkspace.tsx` — functional PDF/image workspaces
- `lib/pdf-tools.ts` — pdf-lib + PDF.js processing
- `lib/image-tools.ts` — Canvas-based browser image pipeline
- `lib/tools.ts` — tool metadata, file detection and command search
- `lib/download.ts` — direct downloads and ZIP export

## Product principle

**One drop. Multiple tools.**

FastFiles aims to make ordinary file utilities feel like a precise modern software product rather than a directory of disconnected converter pages.
