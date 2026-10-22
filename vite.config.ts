import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The demo imports the library by its package name. In dev that resolves to the source;
// with FOLDABLE_DIST=1 it resolves to the built package, to check what gets published.
const lib = (entry: string) =>
  process.env.FOLDABLE_DIST ? resolve(__dirname, `dist/${entry}.js`) : resolve(__dirname, `src/${entry}`)

export default defineConfig({
  root: 'demo',
  plugins: [react(), vue(), svelte()],
  resolve: {
    alias: [
      { find: /^foldable-magazine\/element$/, replacement: lib('element') },
      { find: /^foldable-magazine\/react$/, replacement: lib('react') },
      { find: /^foldable-magazine\/vue$/, replacement: lib('vue') },
      { find: /^foldable-magazine\/svelte$/, replacement: lib('svelte') },
      { find: /^foldable-magazine$/, replacement: lib('index') },
    ],
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        ['index', 'react', 'vue', 'svelte', 'element'].map((name) => [name, resolve(__dirname, `demo/${name}.html`)]),
      ),
    },
  },
})
