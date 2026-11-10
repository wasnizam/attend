// Turns the raw captures (capture.mjs) into App Store images at Apple's exact sizes: screenshots
// for iPhone 6.9" (1320 × 2868) and iPad 13" (2064 × 2752), a product page header (3840 × 1646)
// and a search results image (1920 × 1280). Each is an HTML page drawn by Chrome at that size.
// Usage: node scripts/appstore/compose.mjs [rawDir] [outDir] [en|ms]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'

const [rawDir = 'marketing/appstore/raw', outDir = 'marketing/appstore', LANG = 'en'] = process.argv.slice(2)
const raw = (f) => `file://${resolve(rawDir, f)}`
const font = (f) => `file://${resolve('node_modules', f)}`
mkdirSync(`${outDir}/iphone`, { recursive: true })
mkdirSync(`${outDir}/ipad`, { recursive: true })

const SHOTS_MS = [
  { file: '1-live', title: 'Kehadiran QR <em>dalam beberapa saat</em>', sub: 'Paparkan kod. Senarai terisi sendiri.' },
  { file: '2-checkin', title: 'Pelajar imbas dengan <em>telefon sendiri</em>', sub: 'Tiada aplikasi atau akaun diperlukan.' },
  { file: '3-dashboard', title: 'Seluruh semester <em>sepintas lalu</em>', sub: 'Kehadiran, kelas diadakan, siapa berisiko.' },
  { file: '4-report', title: 'Laporan semester, <em>peraturan 80%</em>', sub: 'Surat amaran dan senarai halangan sekali tekan.' },
  { file: '5-calendar', title: 'Cuti umum <em>ditambah untuk anda</em>', sub: 'Mengikut negara dan negeri anda, setiap tahun.' },
  { file: '7-welcome', title: 'Daftar masuk <em>tanpa akaun</em>', sub: 'Atau log masuk untuk urus kelas dan staf.' },
  { file: '6-dark', title: 'Selesa di mata dengan <em>mod gelap</em>', sub: 'Mengikut telefon anda, siang dan malam.' },
]
// The header and search results words, by language.
const HERO = {
  en: { head: 'Attendance in seconds.', em: 'Scan, and it’s done.', sub: 'QR attendance for classes, courses and workplaces.', sub2: 'No machine, no app for the people checking in.', short: 'For classes, courses and workplaces. No app needed to check in.' },
  ms: { head: 'Kehadiran dalam saat.', em: 'Imbas, dan siap.', sub: 'Kehadiran QR untuk kelas, kursus dan tempat kerja.', sub2: 'Tiada mesin, tiada aplikasi untuk mereka yang imbas.', short: 'Untuk kelas, kursus dan tempat kerja. Tiada aplikasi diperlukan.' },
}[LANG]

const SHOTS_EN = [
  { file: '1-live', title: 'QR attendance <em>in seconds</em>', sub: 'Show the code. The list fills itself.' },
  { file: '2-checkin', title: 'Students scan with <em>their own phone</em>', sub: 'No app or account needed to check in.' },
  { file: '3-dashboard', title: 'The whole semester <em>at a glance</em>', sub: 'Attendance, classes held, who is at risk.' },
  { file: '4-report', title: 'Semester report with the <em>80% rule</em>', sub: 'Warning letters and barring list in one tap.' },
  { file: '5-calendar', title: 'Public holidays <em>added for you</em>', sub: 'For your country and state, every year.' },
  { file: '7-welcome', title: 'Check in <em>without an account</em>', sub: 'Or sign in to run classes and staff.' },
  { file: '6-dark', title: 'Easy on the eyes in <em>dark mode</em>', sub: 'Follows your phone, day and night.' },
]
const SHOTS = LANG === 'ms' ? SHOTS_MS : SHOTS_EN

const base = `
@font-face { font-family: Display; src: url('${font('@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2')}'); font-weight: 200 800; }
@font-face { font-family: Body; src: url('${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { background: #16123f; color: #fff; font-family: Body, sans-serif; position: relative; }
.glow { position: absolute; inset: 0; background:
  radial-gradient(60% 40% at 90% 0%, rgb(255 200 61 / 0.20), transparent 60%),
  radial-gradient(70% 45% at 0% 100%, rgb(99 102 241 / 0.55), transparent 65%); }
.dots { position: absolute; inset: 0; background-image: radial-gradient(rgb(255 255 255 / 0.07) 2px, transparent 2px); background-size: 44px 44px; mask-image: linear-gradient(to bottom, black, transparent 55%); }
h1 { font-family: Display, sans-serif; font-weight: 700; letter-spacing: -0.03em; line-height: 1.02; }
h1 em { font-style: normal; color: #ffc83d; }
.sub { color: rgb(224 231 255 / 0.85); }
.device { position: absolute; left: 50%; transform: translateX(-50%); background: #0b0a1f; box-shadow: 0 60px 140px -40px rgb(0 0 0 / 0.7), 0 0 0 2px rgb(255 255 255 / 0.10); }
.screen { position: relative; overflow: hidden; background: #fff; }
.screen img { display: block; width: 100%; }
.status { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.island { position: absolute; left: 50%; transform: translateX(-50%); background: #000; border-radius: 999px; }
`

/** The colour at the top of a capture, so the phone's status bar sits on the same colour. */
async function topColour(file) {
  const { data } = await sharp(resolve(rawDir, file)).extract({ left: 20, top: 8, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  const [r, g, b] = data
  return { css: `rgb(${r} ${g} ${b})`, dark: r * 0.299 + g * 0.587 + b * 0.114 < 128 }
}

/** Signal, Wi-Fi and battery, drawn in the status bar's text colour. */
const icons = (h) => `<svg viewBox="0 0 68 14" height="${h}" fill="currentColor" aria-hidden="true">
  <rect x="0" y="9" width="3" height="5" rx="1"/><rect x="4.5" y="6.5" width="3" height="7.5" rx="1"/><rect x="9" y="4" width="3" height="10" rx="1"/><rect x="13.5" y="1" width="3" height="13" rx="1"/>
  <path d="M30 13.5l-2.3-2.6a3.4 3.4 0 0 1 4.6 0zM24.6 7.9a7.7 7.7 0 0 1 10.8 0l-1.6 1.8a5.3 5.3 0 0 0-7.6 0zM21.6 4.6a12 12 0 0 1 16.8 0l-1.6 1.8a9.6 9.6 0 0 0-13.6 0z"/>
  <rect x="43" y="1.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="45" y="3.5" width="17" height="7" rx="1.6"/><rect x="65" y="5" width="1.8" height="4" rx=".8" opacity=".45"/></svg>`

function phone(img, colour, w) {
  // iPhone 6.9": the screen at width w, a 54 pt status bar above it (scaled), the Dynamic Island.
  const k = w / 440
  const bar = Math.round(54 * k)
  return `
  <div class="screen" style="width:${w}px;border-radius:${Math.round(56 * k)}px">
    <div class="status" style="height:${bar}px;background:${colour.css};color:${colour.dark ? '#fff' : '#000'};padding:0 ${Math.round(32 * k)}px;font-size:${Math.round(16 * k)}px">
      <span>9:41</span>${icons(Math.round(17 * k))}
    </div>
    <div class="island" style="top:${Math.round(11 * k)}px;width:${Math.round(124 * k)}px;height:${Math.round(36 * k)}px"></div>
    <img src="${img}">
  </div>`
}

function tablet(img, colour, w) {
  const k = w / 1032
  const bar = Math.round(24 * k)
  return `
  <div class="screen" style="width:${w}px;border-radius:${Math.round(18 * k)}px">
    <div class="status" style="height:${bar}px;background:${colour.css};color:${colour.dark ? '#fff' : '#000'};padding:0 ${Math.round(22 * k)}px;font-size:${Math.round(12 * k)}px">
      <span>9:41&nbsp;&nbsp;Wed 11 Nov</span>${icons(Math.round(13 * k))}
    </div>
    <img src="${img}">
  </div>`
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] })

async function render(html, width, height, path) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  // Opened as a file, so it may show the captures and fonts from disk.
  const tmp = resolve(outDir, '.page.html')
  writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${html}</body></html>`)
  await page.goto(`file://${tmp}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 300))
  await page.screenshot({ path, type: 'png' })
  await page.close()
  // Apple refuses transparency: flatten onto night blue, and check the size.
  const flat = await sharp(path).flatten({ background: '#16123f' }).png().toBuffer()
  await sharp(flat).toFile(path)
  const meta = await sharp(path).metadata()
  if (meta.width !== width || meta.height !== height) throw new Error(`${path} is ${meta.width}×${meta.height}`)
  console.log('made', path, `${width}×${height}`)
}

let n = 0
for (const s of SHOTS) {
  n += 1
  for (const device of ['iphone', 'ipad']) {
    const file = `${device}-${s.file}.png`
    if (!existsSync(resolve(rawDir, file))) continue
    // On an iPad these two are a small card in a big empty screen: kept for iPhone only.
    if (device === 'ipad' && (s.file === '2-checkin' || s.file === '7-welcome')) continue
    const colour = await topColour(file)
    const html =
      device === 'iphone'
        ? `<div class="glow"></div><div class="dots"></div>
           <div style="position:absolute;top:170px;left:90px;right:90px;text-align:center">
             <h1 style="font-size:112px">${s.title}</h1>
             <p class="sub" style="margin-top:34px;font-size:46px;line-height:1.3">${s.sub}</p>
           </div>
           <div class="device" style="top:640px;padding:22px;border-radius:118px">${phone(raw(file), colour, 1000)}</div>`
        : `<div class="glow"></div><div class="dots"></div>
           <div style="position:absolute;top:150px;left:140px;right:140px;text-align:center">
             <h1 style="font-size:108px">${s.title}</h1>
             <p class="sub" style="margin-top:30px;font-size:48px">${s.sub}</p>
           </div>
           <div class="device" style="top:500px;padding:28px;border-radius:60px">${tablet(raw(file), colour, 1500)}</div>`
    await render(html, device === 'iphone' ? 1320 : 2064, device === 'iphone' ? 2868 : 2752, `${outDir}/${device}/${String(n).padStart(2, '0')}-${s.file}.png`)
  }
}

// The product page header and the search results image: the promise, and three phones.
const hero = async (w, h, path, layout) => {
  const shots = await Promise.all(['iphone-1-live.png', 'iphone-3-dashboard.png', 'iphone-2-checkin.png'].map(async (f) => ({ img: raw(f), colour: await topColour(f) })))
  await render(layout(shots), w, h, path)
}
const logo = (size) => `<div style="display:flex;align-items:center;gap:${size * 0.3}px">
  <img src="${raw('../../../public/favicon.svg')}" style="width:${size}px;height:${size}px;border-radius:${size * 0.22}px">
  <span style="font-family:Display;font-weight:700;font-size:${size * 0.78}px;letter-spacing:-0.02em">Dobry</span></div>`

await hero(3840, 1646, `${outDir}/header-3840x1646.png`, (p) => `<div class="glow"></div><div class="dots"></div>
  <div style="position:absolute;left:260px;top:0;bottom:0;width:1700px;display:flex;flex-direction:column;justify-content:center">
    ${logo(120)}
    <h1 style="font-size:150px;margin-top:70px">${HERO.head}<br><em>${HERO.em}</em></h1>
    <p class="sub" style="font-size:56px;margin-top:50px;line-height:1.35">${HERO.sub}<br>${HERO.sub2}</p>
  </div>
  <div class="device" style="left:2350px;top:250px;transform:rotate(-6deg);padding:16px;border-radius:84px">${phone(p[1].img, p[1].colour, 600)}</div>
  <div class="device" style="left:2900px;top:150px;transform:rotate(4deg);padding:16px;border-radius:84px">${phone(p[0].img, p[0].colour, 640)}</div>`)

await hero(1920, 1280, `${outDir}/search-1920x1280.png`, (p) => `<div class="glow"></div><div class="dots"></div>
  <div style="position:absolute;top:90px;left:0;right:0;text-align:center">
    <h1 style="font-size:92px">${HERO.head} <em>${HERO.em}</em></h1>
    <p class="sub" style="font-size:38px;margin-top:22px">${HERO.short}</p>
  </div>
  <div class="device" style="left:520px;top:420px;transform:translateX(-50%) rotate(-5deg);padding:10px;border-radius:56px">${phone(p[1].img, p[1].colour, 400)}</div>
  <div class="device" style="left:960px;top:360px;padding:10px;border-radius:56px">${phone(p[0].img, p[0].colour, 420)}</div>
  <div class="device" style="left:1400px;top:420px;transform:translateX(-50%) rotate(5deg);padding:10px;border-radius:56px">${phone(p[2].img, p[2].colour, 400)}</div>`)

await hero(3840, 2560, `${outDir}/search-3840x2560.png`, (p) => `<div class="glow"></div><div class="dots"></div>
  <div style="position:absolute;top:180px;left:0;right:0;text-align:center">
    <h1 style="font-size:184px">${HERO.head} <em>${HERO.em}</em></h1>
    <p class="sub" style="font-size:76px;margin-top:44px">${HERO.short}</p>
  </div>
  <div class="device" style="left:1040px;top:840px;transform:translateX(-50%) rotate(-5deg);padding:20px;border-radius:112px">${phone(p[1].img, p[1].colour, 800)}</div>
  <div class="device" style="left:1920px;top:720px;padding:20px;border-radius:112px">${phone(p[0].img, p[0].colour, 840)}</div>
  <div class="device" style="left:2800px;top:840px;transform:translateX(-50%) rotate(5deg);padding:20px;border-radius:112px">${phone(p[2].img, p[2].colour, 800)}</div>`)

await browser.close()
