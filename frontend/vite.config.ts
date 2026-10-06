import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Encaminha a API e as imagens enviadas para o agrostand-backend em dev.
  // changeOrigin faz o backend montar as URLs de upload com o host dele (localhost:3000).
  server: {
    // Permite que o popup do "Entrar com Google" devolva a credencial via postMessage.
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    proxy: {
      '/api': { target: process.env.VITE_BACKEND_URL || 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: process.env.VITE_BACKEND_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
})
