// Small, copyable starting points for the binding shown on each demo page.
const pages = "['/cover.jpg', '/page-2.jpg']"

export const examples = {
  index: {
    name: 'Vanilla',
    code: `import { LeafThrough } from 'leafthrough'

const pages = ${pages}
const mount = document.querySelector('#magazine')
if (mount) new LeafThrough(mount, { pages })`,
  },
  react: {
    name: 'React',
    code: `import { LeafThrough } from 'leafthrough/react'

const pages = ${pages}
export function Magazine() {
  return <LeafThrough pages={pages} style={{ height: '70vh' }} />
}`,
  },
  vue: {
    name: 'Vue',
    code: `<script setup>
import { LeafThrough } from 'leafthrough/vue'

const pages = ${pages}
</script>

<template>
  <LeafThrough :pages="pages" style="height: 70vh" />
</template>`,
  },
  svelte: {
    name: 'Svelte',
    code: `<script>
  import { leafThrough } from 'leafthrough/svelte'

  const pages = ${pages}
</script>

<div style="height: 70vh" use:leafThrough={{ pages }}></div>`,
  },
  element: {
    name: 'Web Component',
    code: `<script type="module">import 'leafthrough/element'</script>

<leaf-through style="height: 70vh" label="My magazine">
  <img src="/cover.jpg" alt="Cover" />
  <img src="/page-2.jpg" alt="Page two" />
</leaf-through>`,
  },
} as const

export type ExampleKey = keyof typeof examples

export function currentExample() {
  const key = location.pathname.split('/').pop()?.replace(/\.html$/, '') as ExampleKey
  return examples[key] ?? examples.index
}
