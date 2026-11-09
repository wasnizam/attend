// The iPhone and Android apps' icons and launch screens, from the same Dobry mark as the website's icons
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
// Android: the classic square and round icons, the adaptive icon's layers, and the launch screen.
const res = 'android/app/src/main/res'
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const round = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`)
for (const [d, k] of Object.entries(densities)) {
  const icon = Math.round(48 * k)
  const square = await sharp(mark(0.92, '#241e63'), { density: 1200 }).resize(icon, icon).png().toBuffer()
  await sharp(square).toFile(`${res}/mipmap-${d}/ic_launcher.png`)
  // The round one has the mark a little smaller, so the bar clears the circle's edge.
  const inner = await sharp(mark(0.74, '#241e63'), { density: 1200 }).resize(icon, icon).png().toBuffer()
  await sharp(inner).composite([{ input: round(icon), blend: 'dest-in' }]).png().toFile(`${res}/mipmap-${d}/ic_launcher_round.png`)
  // The adaptive icon's front layer: the mark inside the middle 66%, which every phone shape shows.
  const fg = Math.round(108 * k)
  await sharp(mark(0.62, 'none'), { density: 1200 }).resize(fg, fg).png().toFile(`${res}/mipmap-${d}/ic_launcher_foreground.png`)
  const [w, h] = [320, 480].map((x) => Math.round(x * k))
  for (const [dir, width, height] of [[`drawable-port-${d}`, w, h], [`drawable-land-${d}`, h, w]]) {
    const side = Math.max(width, height)
    await sharp(splash).resize(side, side).extract({ left: Math.round((side - width) / 2), top: Math.round((side - height) / 2), width, height }).png().toFile(`${res}/${dir}/splash.png`)
  }
}
await sharp(splash).resize(480, 480).extract({ left: 80, top: 0, width: 320, height: 480 }).png().toFile(`${res}/drawable/splash.png`)
console.log('done')
