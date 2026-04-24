import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/OTTOs-RM-CS/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Include all data JSON files in the precache
      includeAssets: ['**/*.svg', '**/*.json'],
      workbox: {
        // Cache everything — the whole app works offline
        globPatterns: ['**/*.{js,css,html,svg,json,woff2}'],
        // Don't let workbox try to cache the CoreLaw PDF (it's huge)
        globIgnores: ['**/CoreLaw.pdf'],
        navigateFallback: BASE + 'index.html',
        navigateFallbackAllowlist: [/^\/OTTOs-RM-CS/],
        runtimeCaching: [],
        // Bundle can exceed 2 MiB — raise the limit
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Rolemaster Unified',
        short_name: 'RM Sheet',
        description: 'Rolemaster Unified interactive character sheet',
        theme_color: '#1a1a2e',
        background_color: '#0f0f1a',
        display: 'standalone',
        scope: BASE,
        start_url: BASE,
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: parseInt(process.env.PORT || '5173'),
  },
})
