import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The demo imports the library by its package name. In dev that resolves to the source;
// with LEAFTHROUGH_DIST=1 it resolves to the built package, to check what gets published.
const lib = (entry: string) =>
  process.env.LEAFTHROUGH_DIST ? resolve(__dirname, `dist/${entry}.js`) : resolve(__dirname, `src/${entry}`)

export default defineConfig({
  root: 'demo',
  // relative asset URLs, so the built demo works under any path (GitHub Pages serves it
  // from /leafthrough/)
  base: './',
  plugins: [react(), vue(), svelte()],
  resolve: {
    alias: [
      { find: /^leafthrough\/element$/, replacement: lib('element') },
      { find: /^leafthrough\/react$/, replacement: lib('react') },
      { find: /^leafthrough\/vue$/, replacement: lib('vue') },
      { find: /^leafthrough\/svelte$/, replacement: lib('svelte') },
      { find: /^leafthrough$/, replacement: lib('index') },
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
