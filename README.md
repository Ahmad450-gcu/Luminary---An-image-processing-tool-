# Luminary

A browser-based image enhancement tool built around a zero-data architecture. All processing happens locally using the Canvas API — no uploads, no accounts, no server-side computation.

Built as a Digital Image Processing project at GCU Lahore.

---

## Overview

Luminary provides 11 DIP operations through a clean editor interface with real-time preview, split-view comparison, and smart auto-adjustment. The processing engine runs entirely in your browser — images never leave your device.

---

## Features

- **11 image filters** covering the core DIP operations: gamma correction, contrast stretching, histogram equalization, median/Gaussian filtering, edge detection, and more
- **Smart Auto-Adjust** — analyses brightness, contrast, and shadow distribution to automatically pick and apply the most appropriate correction
- **Split-view comparison** — drag a handle to compare the original and enhanced image side by side
- **Web Worker processing** — computationally heavy filters (Median, Gaussian) run off the main thread so the UI stays responsive
- **Export as PNG** — lossless download of the processed result
- **Dark / light theme** — persisted via `localStorage`
- **Privacy-first** — zero telemetry, zero data retention, no login required

---

## Filters

| Filter | Description |
|---|---|
| Reverse Colors | Inverts all pixel values — equivalent to a film negative |
| Reveal Dark Details | Log-based shadow lift; raises dark tones without blowing out highlights |
| Brightness Control | Power-law gamma correction; adjustable from brighten to darken |
| Boost Contrast | Per-channel contrast stretching across the full dynamic range |
| Bold Black & White | Binary threshold conversion with an adjustable brightness cutoff |
| Highlight a Brightness Range | Intensity-level slicing; isolates a tonal band with optional background removal |
| Auto Balance | Histogram equalization for redistributing brightness |
| Remove Noise & Specks | Median filter with adjustable radius (runs in Web Worker) |
| Soften & Blur | Separable Gaussian blur with adjustable sigma (runs in Web Worker) |
| Find Edges & Outlines | Sobel edge detection with adjustable sensitivity threshold |
| Grayscale Blend | Blends the original with its luma-based grayscale version |

---

## Project Structure

```
luminary/
├── index.html       # SPA shell — all pages in one file
├── app.js           # Page routing, theme, FAQ accordion
├── editor.js        # Editor logic — upload, filter selection, canvas rendering
├── filters.js       # All 11 filter functions + Smart Auto-Adjust analyser
├── worker.js        # Web Worker for Median and Gaussian (off-thread)
├── main.css         # Full design system + responsive layout
└── favicon.svg      # Logo
```

---

## Getting Started

No build step or dependencies. Just serve the files from any static server.

**Option 1 — VS Code Live Server**

Open the folder in VS Code and click **Go Live** in the status bar.

**Option 2 — Python**

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

**Option 3 — Node**

```bash
npx serve .
```

> Note: Opening `index.html` directly via `file://` will block the Web Worker due to browser security restrictions. Use a local server.

---

## Usage

1. Click **Launch Editor** or navigate to the Editor tab
2. Drop an image onto the upload area, or click to browse (JPG, PNG, WEBP, GIF, BMP — up to 30 MB)
3. Pick a filter from the right panel, adjust its parameters if available
4. Use the **Result / Compare / Original** tabs to evaluate the output
5. Click **Export** to download a lossless PNG
6. Use **Smart Auto-Adjust** to let the tool pick the best correction automatically
7. Click **Reset** to clear the filter selection and restore the original

---

## Browser Support

Works in any modern browser that supports the Canvas API and ES Modules.

| Browser | Support |
|---|---|
| Chrome / Edge | ✓ Full |
| Firefox | ✓ Full |
| Safari 15+ | ✓ Full |
| Safari < 15 | Partial (some CSS backdrop-filter differences) |

---

## Technical Notes

**Why a Web Worker for only two filters?**
Median and Gaussian are O(W × H × k²) operations. On a 12 MP image at radius 3, the Median filter evaluates 49 neighbours per pixel across ~12 million pixels. Running that on the main thread would freeze the UI for several seconds. The worker receives a transferable `ArrayBuffer` copy of the pixel data, processes it, and transfers the result back — avoiding any copy overhead on return.

**Smart Auto-Adjust logic:**
The analyser computes mean luma, standard deviation, dynamic range, dark pixel fraction (below 64), and bright pixel fraction (above 192). It then applies a decision tree: underexposed → gamma lift, overexposed → gamma darken, narrow range → contrast stretch, low stdDev → histogram equalization, heavy shadows → log shadow lift.

**Split-view rendering:**
The canvas always draws the full result first, then clips a `ctx.rect` to the left portion and redraws the original offscreen canvas on top. This guarantees a pixel-exact boundary with no bleed regardless of display scaling.

---

## License

MIT — free for personal and commercial use.

---

*Luminary — Muhammad Ahmad, GCU Lahore, Digital Image Processing*
