import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Attend',
        short_name: 'Attend',
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
        navigateFallback: '/index.html',
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
