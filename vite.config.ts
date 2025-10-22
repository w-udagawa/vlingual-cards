import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Vercel用のベースパス（ルート配置）
  build: {
    outDir: 'dist'
  }
})
