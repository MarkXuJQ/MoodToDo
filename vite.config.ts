import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const require = createRequire(import.meta.url)
const { brandConfig } = require('./config/brand.cjs')
const { getLocalApiBaseUrl, localApiDefaults } = require('./config/local-api.cjs')
const localApiPort = process.env.XINXIANGYI_API_PORT ?? localApiDefaults.browserPort

const localApiProxy = {
  '/api': {
    target: getLocalApiBaseUrl({ port: localApiPort }),
    changeOrigin: true,
  },
}

export default defineConfig({
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: localApiProxy,
  },
  preview: {
    host: 'localhost',
    port: 4173,
    strictPort: true,
    proxy: localApiProxy,
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '心象仪',
        short_name: '心象仪',
        description: '离线优先的打卡日记、Todo 和心情模糊量化工具。',
        theme_color: brandConfig.themeColor,
        background_color: brandConfig.backgroundColor,
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: brandConfig.manifestIcons,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})
