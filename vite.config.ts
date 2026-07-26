import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: VITE_BASE=/english-brain-quest-v2/ npm run build
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [react()],
})
