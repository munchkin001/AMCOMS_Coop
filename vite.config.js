
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'AMCOMS',
        short_name: 'AMCOMS',
        description:
          'Agay-Ayan Multipurpose Cooperative Management System',
        theme_color: '#0B4981',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
