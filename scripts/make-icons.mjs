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

// The small icon browsers show on a tab, in bookmarks and in search results. Many still ask for
// /favicon.ico and ignore the SVG, so there is one: three sizes of the same mark in one file.
import { writeFileSync } from 'node:fs'
const small = (size) => sharp(svg(26, 1), { density: 600 }).resize(size, size).png().toBuffer()
await sharp(svg(26, 1), { density: 600 }).resize(32, 32).png().toFile('public/favicon-32.png')
const sizes = [16, 32, 48]
const images = await Promise.all(sizes.map(small))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const at = 6 + 16 * i
  header.writeUInt8(size, at)
  header.writeUInt8(size, at + 1)
  header.writeUInt16LE(1, at + 4)
  header.writeUInt16LE(32, at + 6)
  header.writeUInt32LE(images[i].length, at + 8)
  header.writeUInt32LE(offset, at + 12)
  offset += images[i].length
})
writeFileSync('public/favicon.ico', Buffer.concat([header, ...images]))

// The Console's own icon, so the two apps can be told apart on a home screen: the same mark with
// the colours turned round (a gold tile).
const consoleSvg = (radius, scale) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><clipPath id="h"><rect width="120" height="76"/></clipPath></defs>` +
  `<rect width="120" height="120" rx="${radius}" fill="#ffc83d"/>` +
  `<g transform="translate(60 60) scale(${scale}) translate(-60 -60)">` +
  `<circle cx="60" cy="72" r="32" fill="#16123f" clip-path="url(#h)"/>` +
  `<path d="M45 60l10 10 20-22" fill="none" stroke="#ffc83d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<rect x="22" y="82" width="76" height="7" rx="3.5" fill="#16123f"/></g></svg>`,
)
const consolePng = (radius, scale, size, file) => sharp(consoleSvg(radius, scale), { density: 600 }).resize(size, size).png().toFile(file)
await consolePng(28, 1, 192, 'public/console-192.png')
await consolePng(28, 1, 512, 'public/console-512.png')
await consolePng(0, 0.78, 512, 'public/console-maskable-512.png')
await consolePng(0, 0.92, 180, 'public/console-touch-icon.png')

// The picture shown when a Dobry link is shared (WhatsApp, Facebook, LinkedIn, X): 1200 x 630.
const share = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs>` +
  `<radialGradient id="g" cx="85%" cy="0%" r="75%"><stop offset="0" stop-color="#ffc83d" stop-opacity=".30"/><stop offset="1" stop-color="#ffc83d" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="b" cx="0%" cy="100%" r="70%"><stop offset="0" stop-color="#6366f1" stop-opacity=".55"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></radialGradient>` +
  `<clipPath id="h"><rect width="120" height="76"/></clipPath></defs>` +
  `<rect width="1200" height="630" fill="#16123f"/><rect width="1200" height="630" fill="url(#b)"/><rect width="1200" height="630" fill="url(#g)"/>` +
  `<g transform="translate(80 70) scale(.8)"><rect width="120" height="120" rx="28" fill="#241e63"/><circle cx="60" cy="72" r="32" fill="#ffc83d" clip-path="url(#h)"/>` +
  `<path d="M45 60l10 10 20-22" fill="none" stroke="#16123f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><rect x="22" y="82" width="76" height="7" rx="3.5" fill="#fff"/></g>` +
  `<text x="196" y="140" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="58" font-weight="700" fill="#fff">Dobry</text>` +
  `<text x="80" y="330" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="92" font-weight="800" fill="#fff" letter-spacing="-2">Attendance in seconds.</text>` +
  `<text x="80" y="440" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="92" font-weight="800" fill="#ffc83d" letter-spacing="-2">Scan, and it’s done.</text>` +
  `<text x="80" y="540" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="34" fill="#c7d2fe">No machine to buy. No app to install. Free to start.</text></svg>`,
)
await sharp(share, { density: 144 }).resize(1200, 630).png().toFile('public/share.png')
