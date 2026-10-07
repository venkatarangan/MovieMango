/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  base: '/',
  // The app version comes from package.json, so bumping it there is the only step (see CLAUDE.md).
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['opensearch.xml', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon-180.png', 'moviemango-logo.svg'],
      manifest: {
        name: 'MovieMango',
        short_name: 'MovieMango',
        description: 'Ripe picks for your mood and your moment. Private. Free. Open.',
        theme_color: '#27323F',
        background_color: '#FFF8E1',
        display: 'standalone',
        start_url: '/',
        shortcuts: [
          { name: 'Search', url: '/#/search', icons: [{ src: 'moviemango-logo-192.png', sizes: '192x192' }] },
          { name: 'Tonight’s picks', short_name: 'Tonight', url: '/#/tonight', icons: [{ src: 'moviemango-logo-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: 'moviemango-logo-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'moviemango-logo-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'moviemango-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'moviemango-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // The WebLLM engine (~6 MB) is only needed by people who choose Qwen; cache it on first use instead.
        globIgnores: ['**/assets/web-llm-*.js'],
        navigateFallbackDenylist: [/^\/(about|privacy)\.html$/],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/web-llm-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'web-llm-engine', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'image.tmdb.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 7000,
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) => (chunk.moduleIds.some((id) => id.includes('@mlc-ai/web-llm')) ? 'assets/web-llm-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
