import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

// This config is load-bearing. Cornerstone's DICOM image loader spawns its decode worker
// with `new Worker(new URL('./decodeImageFrameWorker.js', import.meta.url), {type:'module'})`
// and ships wasm codecs alongside it. Three settings make that survive bundling:
//
//   viteCommonjs()  - dicom-parser is still CommonJS
//   optimizeDeps.exclude - pre-bundling rewrites import.meta.url and breaks the worker URL
//   worker.format 'es'   - the worker is an ES module
//
// Get any of them wrong and the symptom is not an error but silence: the viewport stays
// black and volume loads never resolve.
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), viteCommonjs()],

  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },

  worker: {
    format: 'es',
  },

  server: {
    port: 5173,
    // Proxying keeps the SPA and the API same-origin in dev, exactly as nginx does in
    // production. That is what lets the HttpOnly session cookie ride along on the
    // wadors XHRs with no CORS and no token plumbing.
    // Override with BACKEND_URL when port 8000 is already taken.
    proxy: {
      '/api': backend,
      '/dicomweb': backend,
    },
  },

  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096, // the cornerstone bundle is legitimately large
  },
})
