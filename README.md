# Media Format Converter

React + TypeScript + Vite app for converting images and videos in the browser.

## Features

- Batch image conversion to WebP, JPEG, PNG, or AVIF
- Optional image resize with aspect-ratio lock
- Video conversion to MP4, WebM, MOV, or GIF through FFmpeg WASM
- Quality presets, filename prefixing, per-file downloads, and ZIP export
- Dark/light theme saved in local storage

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

The FFmpeg core files are copied from `@ffmpeg/core` into `public/ffmpeg` before dev and build commands.

## Deployment

The project includes a GitHub Pages workflow. Enable Pages from GitHub Actions in the repository settings, then pushes to `main` will build and deploy the app.
