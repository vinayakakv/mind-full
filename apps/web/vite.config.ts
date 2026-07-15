import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'native'
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['mindfull.svg'],
            manifest: {
              name: 'Mindfull',
              short_name: 'Mindfull',
              description: 'A quiet, local-first space for mindful days.',
              theme_color: '#f4f0e8',
              background_color: '#f4f0e8',
              display: 'standalone',
              start_url: '/',
              icons: [
                {
                  src: '/mindfull.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any',
                },
                {
                  src: '/mindfull.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              navigateFallback: '/index.html',
            },
          }),
        ]),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
}));
