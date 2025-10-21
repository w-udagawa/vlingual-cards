import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/vlingual-cards/', // GitHub Pages用のベースパス
  build: {
    outDir: 'dist'
  }
})
