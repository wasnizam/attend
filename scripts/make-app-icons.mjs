// The iPhone app's icon and launch screen, from the same Dobry mark as the website's icons
// (see make-icons.mjs). Run: node scripts/make-app-icons.mjs
import sharp from 'sharp'

const mark = (scale, background) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><clipPath id="h"><rect width="120" height="76"/></clipPath></defs>` +
  `<rect width="120" height="120" fill="${background}"/>` +
  `<g transform="translate(60 60) scale(${scale}) translate(-60 -60)">` +
  `<circle cx="60" cy="72" r="32" fill="#ffc83d" clip-path="url(#h)"/>` +
  `<path d="M45 60l10 10 20-22" fill="none" stroke="#16123f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<rect x="22" y="82" width="76" height="7" rx="3.5" fill="#fff"/></g></svg>`,
)

// Apple rounds the corners itself, and wants no transparency.
await sharp(mark(0.92, '#241e63'), { density: 1200 }).resize(1024, 1024).flatten({ background: '#241e63' }).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')

// Launch screen: the mark small in the middle of night blue.
const splash = await sharp(mark(0.3, '#16123f'), { density: 1200 }).resize(2732, 2732).flatten({ background: '#16123f' }).png().toBuffer()
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await sharp(splash).toFile(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`)
}
console.log('done')
