import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    element: 'src/element.ts',
    react: 'src/react.tsx',
    vue: 'src/vue.ts',
    svelte: 'src/svelte.ts',
  },
  format: ['esm'],
  target: 'es2022',
  // declarations come from tsc (see tsconfig.build.json)
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['three', 'react', 'react/jsx-runtime', 'vue', 'svelte'],
})
