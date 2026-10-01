// Regenerates the PWA icons in public/ from an inline SVG. Run: node scripts/make-icons.mjs
import sharp from 'sharp'

const svg = (radius, scale) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="#4f46e5"/>` +
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><path d="M148 268l72 72 144-160" fill="none" stroke="#fff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
)

await sharp(svg(112, 1)).resize(192).png().toFile('public/icon-192.png')
await sharp(svg(112, 1)).resize(512).png().toFile('public/icon-512.png')
await sharp(svg(0, 0.72)).resize(512).png().toFile('public/icon-maskable-512.png')
await sharp(svg(0, 0.9)).resize(180).png().toFile('public/apple-touch-icon.png')
