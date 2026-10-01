// The PDF library's background worker, with the Safari fix loaded before it.
// Order matters: imports run top to bottom.
import './streamPolyfill'
import 'pdfjs-dist/legacy/build/pdf.worker.mjs'
