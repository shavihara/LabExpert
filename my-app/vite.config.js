import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      'plotly.js/dist/plotly': 'plotly.js-dist-min'
    }
  },
  optimizeDeps: {
    exclude: ['plotly.js-dist-min'],
    include: ['react-plotly.js']
  },
  build: {
    rollupOptions: {
      external: ['buffer'],
      output: {
        manualChunks: {
          plotly: ['plotly.js-dist-min']
        }
      }
    }
  },
  server: {
    port: 5173
  },
  plugins: [
    react(),
    ...(mode === 'production'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            manifest: {
              name: 'Lab Expert',
              short_name: 'LabExpert',
              description: 'Your lab experiment app',
              theme_color: '#667eea',
              background_color: '#ffffff',
              display: 'standalone',
              scope: '/',
              start_url: '/',
              orientation: 'portrait-primary',
              icons: [
                { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
              ]
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
              maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10MB to handle large Plotly assets
            }
          })
        ]
      : [])
  ]
}));