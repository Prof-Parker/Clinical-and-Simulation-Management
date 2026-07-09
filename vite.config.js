import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : (process.env.SHAREPOINT_BASE_URL || process.env.VITE_DEPLOY_BASE || '/Clinical-and-Simulation-Management/'),
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/**/*', 'manifest.webmanifest'],
      manifest: {
        name: 'Clinical & Simulation Management',
        short_name: 'Clin & Sim',
        description: 'REGN 15P cohort scheduling, clinical and simulation requirement tracking.',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [],
        navigateFallbackDenylist: [/\.json$/]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/vitest-setup.js']
  }
}));
