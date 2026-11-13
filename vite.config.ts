import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Finances',
        short_name: 'Finances',
        description: 'Gérez vos revenus, vos dépenses et votre épargne, même hors ligne.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f3ec',
        theme_color: '#0f5c4a',
        icons: [
          { src: 'icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: { port: 5183 },
})
