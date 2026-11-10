// Captures Dobry's screens at the App Store's exact sizes, from the local test copy (npm run
// dev:emulator, with the emulators and sample data). The page is told it runs inside the phone
// app, so the website's banners stay out, as in the real app.
// Usage: node scripts/appstore/capture.mjs <email> <password> [outDir]
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const [email, password, out = 'marketing/appstore/raw'] = process.argv.slice(2)
if (!email || !password) throw new Error('Usage: node scripts/appstore/capture.mjs <email> <password> [outDir]')
mkdirSync(out, { recursive: true })
const BASE = 'http://localhost:5173'
const SESSION = 'demo-data-structures_2026-11-11_0900'

const DEVICES = {
  // iPhone 6.9": 440 × 956 points at 3× = 1320 × 2868 pixels.
  iphone: { width: 440, height: 956, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // iPad 13": 1032 × 1376 points at 2× = 2064 × 2752 pixels.
  ipad: { width: 1032, height: 1376, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] })

async function preparePage(device, { theme = 'light', lang = 'en', fresh = false } = {}) {
  // A fresh window has no saved sign-in: for the welcome screen and the student's check-in.
  const page = fresh ? await (await browser.createBrowserContext()).newPage() : await browser.newPage()
  await page.setViewport(DEVICES[device])
  await page.evaluateOnNewDocument(
    (theme, lang) => {
      // Capacitor's web part fills this object in when it loads; the two answers that say "app" stay.
      const keep = { isNativePlatform: () => true, getPlatform: () => 'ios' }
      const fake = new Proxy({ ...keep, Plugins: {} }, { set: (t, k, v) => ((k in keep) || (t[k] = v), true) })
      Object.defineProperty(window, 'Capacitor', { get: () => fake, set: () => {}, configurable: false })
      try {
        localStorage.setItem('dobry.app.welcomed', '1')
        localStorage.setItem('dobry.app.cameraExplained', '1')
        localStorage.setItem('attend.lang', lang)
        if (theme === 'dark') localStorage.setItem('dobry.theme', 'dark')
        else localStorage.setItem('dobry.theme', 'light')
      } catch {}
    },
    theme,
    lang,
  )
  return page
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  // Already signed in (an earlier page): the sign-in screen moves on by itself.
  await page.waitForFunction(() => document.querySelector('input[type=email]') || location.pathname.startsWith('/app'), { timeout: 60000 })
  if (await page.evaluate(() => location.pathname.startsWith('/app'))) return
  await page.type('input[type=email]', email)
  await page.type('input[type=password]', password)
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 60000 })
}

async function shot(page, path, name, ready, { scroll = 0 } = {}) {
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForFunction(ready, { timeout: 60000, polling: 500 })
  await new Promise((r) => setTimeout(r, 2500))
  await page.evaluate(showLiveAddress)
  await page.evaluate((y) => window.scrollTo(0, y), scroll)
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('saved', name)
}

/** The test copy runs on localhost; the store shows the real address people will see. */
function showLiveAddress() {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes('localhost:5173')) n.nodeValue = n.nodeValue.replace('http://localhost:5173', 'dobry.app')
}

const has = (text) => new Function(`return document.body.innerText.includes(${JSON.stringify(text)})`)

for (const device of ['iphone', 'ipad']) {
  const page = await preparePage(device)
  await signIn(page)
  await shot(page, `/app/session/${SESSION}`, `${device}-1-live`, has('LIVE ATTENDANCE'))
  await shot(page, '/app/overview', `${device}-3-dashboard`, has('Classes, lowest attendance first'))
  await shot(page, '/app/timetable/demo-data-structures/report', `${device}-4-report`, has('Where students stand'))
  await shot(page, '/app/calendar', `${device}-5-calendar`, has('Public holidays'))
  await page.close()

  // The student's side: the check-in page their phone opens from the QR.
  const student = await preparePage(device, { fresh: true })
  const token = await (async () => {
    const p = await preparePage(device)
    await signIn(p)
    await p.goto(`${BASE}/app/session/${SESSION}`, { waitUntil: 'networkidle2' })
    await p.waitForFunction(() => /session\/[A-Z0-9]{6}/.test(document.body.innerText), { timeout: 60000 })
    const t = await p.evaluate(() => document.body.innerText.match(/session\/([A-Z0-9]{6})/)[1])
    await p.close()
    return t
  })()
  await student.goto(`${BASE}/session/${token}`, { waitUntil: 'networkidle2' })
  await student.waitForSelector('input', { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1500))
  // A student halfway through: their ID and the code from the screen typed in.
  const inputs = await student.$$('input')
  if (inputs[0]) await inputs[0].type('A21CS0108')
  if (inputs[1]) await inputs[1].type('K7QAK')
  await student.evaluate(() => document.activeElement?.blur())
  await new Promise((r) => setTimeout(r, 800))
  await student.screenshot({ path: `${out}/${device}-2-checkin.png` })
  console.log('saved', `${device}-2-checkin`)
  await student.close()

  // Dark mode, to show it.
  const dark = await preparePage(device, { theme: 'dark' })
  await signIn(dark)
  await shot(dark, '/app/overview', `${device}-6-dark`, has('Classes, lowest attendance first'), { scroll: device === 'iphone' ? 600 : 0 })
  await dark.close()

  // The phone app's first screen.
  const welcome = await preparePage(device, { fresh: true })
  await welcome.evaluateOnNewDocument(() => localStorage.removeItem('dobry.app.welcomed'))
  await welcome.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await welcome.waitForFunction(has('How will you use Dobry?'), { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1500))
  await welcome.screenshot({ path: `${out}/${device}-7-welcome.png` })
  console.log('saved', `${device}-7-welcome`)
  await welcome.close()
}

await browser.close()
