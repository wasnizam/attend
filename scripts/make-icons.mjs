// Regenerates the PWA icons in public/ from the Dobry mark (the sunrise tick). Run: node scripts/make-icons.mjs
// The same drawing is in public/favicon.svg.
import sharp from 'sharp'

// `radius` rounds the square (0 for icons the phone masks itself); `scale` shrinks the drawing
// towards the middle, to keep it inside a mask's safe area.
const svg = (radius, scale) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><clipPath id="h"><rect width="120" height="76"/></clipPath></defs>` +
  `<rect width="120" height="120" rx="${radius}" fill="#241e63"/>` +
  `<g transform="translate(60 60) scale(${scale}) translate(-60 -60)">` +
  `<circle cx="60" cy="72" r="32" fill="#ffc83d" clip-path="url(#h)"/>` +
  `<path d="M45 60l10 10 20-22" fill="none" stroke="#16123f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<rect x="22" y="82" width="76" height="7" rx="3.5" fill="#fff"/></g></svg>`,
)

const png = (radius, scale, size, file) => sharp(svg(radius, scale), { density: 600 }).resize(size, size).png().toFile(file)
await png(28, 1, 192, 'public/icon-192.png')
await png(28, 1, 512, 'public/icon-512.png')
await png(0, 0.78, 512, 'public/icon-maskable-512.png')
await png(0, 0.92, 180, 'public/apple-touch-icon.png')
