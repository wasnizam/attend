import { readFileSync, writeFileSync } from 'node:fs'
import { type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { PAGES, SITE } from './src/lib/seo'

/**
 * The Console gets its own page file, the same app with the Console's name, icon and manifest
 * written into it. An iPhone reads those when the page loads, before any script runs, so this is
 * what makes "Add to Home Screen" from the Console give a Console app and not the Dobry one.
 */
const consolePage = (): Plugin => ({
  name: 'dobry-console-page',
  apply: 'build',
  closeBundle() {
    const html = readFileSync('dist/index.html', 'utf8')
    const page = html
      .replace(/<link rel="manifest"[^>]*>/, '<link rel="manifest" href="/console.webmanifest" />')
      .replace(/<link rel="apple-touch-icon"[^>]*>/, '<link rel="apple-touch-icon" href="/console-touch-icon.png" />')
      .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*"/, '$1Dobry Console"')
      .replace(/<title>[^<]*<\/title>/, '<title>Dobry Console</title>')
    if (!page.includes('/console.webmanifest')) throw new Error('console.html: the manifest link was not found in index.html')
    writeFileSync('dist/console.html', page)
  },
})

/**
 * Each public page gets its own file with its own title, description, address and share preview
 * written in. Search engines and link previews (WhatsApp, LinkedIn) read these before any script
 * runs, so without them every page looked like the same page.
 */
const seoPages = (): Plugin => ({
  name: 'dobry-seo-pages',
  apply: 'build',
  closeBundle() {
    const html = readFileSync('dist/index.html', 'utf8')
    const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    for (const [path, page] of Object.entries(PAGES)) {
      const url = `${SITE}/${path}`
      const out = html
        .replace(/<title>[^<]*<\/title>/, `<title>${page.title.replace(/&/g, '&amp;')}</title>`)
        .replace(/(<meta name="description" content=")[^"]*"/, `$1${attr(page.description)}"`)
        .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
        .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
        .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g, `$1${attr(page.title)}"`)
        .replace(/(<meta (?:property="og:description"|name="twitter:description") content=")[^"]*"/g, `$1${attr(page.description)}"`)
        // The description of the product as a whole belongs to the home page only.
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
      if (!out.includes(`<link rel="canonical" href="${url}"`)) throw new Error(`${path}.html: the canonical link was not found in index.html`)
      writeFileSync(`dist/${path}.html`, out)
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    consolePage(),
    seoPages(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/lib/updates.ts, which also reloads when a new version arrives.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dobry',
        short_name: 'Dobry',
        description: 'Start a session. Share the QR. Attendance is done.',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8fafc',
        theme_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // A new version takes over straight away instead of waiting for every tab and
        // installed copy to be closed first. Without these two, phones stay on an old
        // version indefinitely.
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        // A request for a script or style must never be answered with the app's HTML page.
        // /__/auth/ is Firebase's sign-in helper, passed through by Vercel so Google shows our own address.
        // The Console is fetched fresh, from its own page (see consolePage above), never from the saved Dobry page.
        navigateFallbackDenylist: [/^\/assets\//, /^\/api\//, /^\/__\//, /^\/console(\/|$)/],
        cleanupOutdatedCaches: true,
        // The PDF reader is about 1.2 MB; keep it in the saved copy so every part of an
        // installed version comes from the same release.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  // The PDF worker is an ES module (it uses top-level await).
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
  },
})
