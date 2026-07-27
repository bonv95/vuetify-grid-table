import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // The demo builds against the library source, so `npm run dev` hot-reloads
      // grid edits without a rebuild and Vercel needs no build-order dance.
      'vuetify-grid-table': fileURLToPath(new URL('../packages/vuetify-grid-table/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
})
