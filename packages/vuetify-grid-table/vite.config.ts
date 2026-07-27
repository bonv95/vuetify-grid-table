import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.vue'],
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'VuetifyGridTable',
      fileName: 'vuetify-grid-table',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // Vuetify stays external: the consumer already has it, and two copies
      // would mean two theme/defaults injection contexts.
      external: [/^vue$/, /^vuetify($|\/)/],
      output: {
        // UMD only. Every `vuetify/components/*` subpath lives on the single
        // `Vuetify` global, so they all map to it.
        globals: (id: string) => (id === 'vue' ? 'Vue' : id.startsWith('vuetify') ? 'Vuetify' : id),
        // The package has several named exports next to the default one; without
        // this, UMD consumers would need `VuetifyGridTable.default`.
        exports: 'named',
        assetFileNames: (asset) =>
          asset.names?.[0] === 'style.css' ? 'vuetify-grid-table.css' : '[name][extname]',
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    target: 'es2020',
  },
})
