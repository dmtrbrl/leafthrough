# foldable-magazine

A 3D magazine you can flip through. Pages are printed paper: they bend, roll, catch the
light and cast shadows. Built on three.js, written in TypeScript, with bindings for React,
Vue, Svelte, and a Web Component for everything else (Angular, Solid, Lit, plain HTML).

- **Two layouts.** `spread` is an open magazine with sheets turning over the spine.
  `single` shows one page at a time, and read pages roll up behind the magazine. `auto`
  picks between them with a media query.
- **Real paper feel.** Pages bulge off the spine and nest on the stacks. They bend while
  turning and fold towards wherever you hold them. Paper grain, glossy ink and a little
  show-through complete the look.
- **Drag, click, press and hold, or keys.** Drags follow your hand, and a released page
  falls with the speed you gave it.
- **Customizable** paper, lighting, motion, interactions and page shape.
- **Accessible.** Keyboard control, screen reader announcements and reduced motion
  support.

## Install

```bash
npm install foldable-magazine three
```

`three` (r160 or newer) is a peer dependency. React, Vue and Svelte are optional peers;
install only the one you use.

## Quick start

Every binding renders into an element you size with CSS. The magazine fits itself inside
(see [Sizing](#sizing)).

### Vanilla

```ts
import { FoldableMagazine } from 'foldable-magazine'

const magazine = new FoldableMagazine(document.querySelector('#magazine')!, {
  pages: ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg', '/pages/04.jpg'],
})

magazine.addEventListener('pagechange', (e) => console.log(e.detail.visiblePages))
document.querySelector('#next')!.addEventListener('click', () => magazine.next())
```

### React (18+)

```tsx
import { useRef } from 'react'
import { FoldableMagazine, type FoldableMagazineHandle } from 'foldable-magazine/react'

export function Issue({ pages }: { pages: string[] }) {
  const magazine = useRef<FoldableMagazineHandle>(null)
  return (
    <>
      <FoldableMagazine ref={magazine} pages={pages} style={{ height: '80vh' }} onPageChange={(d) => console.log(d.page)} />
      <button onClick={() => magazine.current?.next()}>Next</button>
    </>
  )
}
```

The component is marked `'use client'` and creates nothing on the server, so it works in
Next.js and other SSR setups. Props are compared by value, so inline objects such as
`paper={{ grain: false }}` don't cause rebuilds. Callbacks can change freely.

### Vue (3.3+)

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FoldableMagazine } from 'foldable-magazine/vue'

const magazine = ref()
const pages = ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg']
</script>

<template>
  <FoldableMagazine ref="magazine" :pages="pages" style="height: 80vh" @pagechange="(d) => console.log(d.page)" />
  <button @click="magazine.next()">Next</button>
</template>
```

The template ref exposes `next()`, `prev()`, `goTo()` and `instance`. Events are
`pagechange`, `ready` and `error`.

### Svelte (4 and 5)

```svelte
<script lang="ts">
  import { foldable, type FoldableMagazine } from 'foldable-magazine/svelte'

  const pages = ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg']
  let magazine: FoldableMagazine
</script>

<div style="height: 80vh" use:foldable={{ pages, onInit: (m) => (magazine = m) }}></div>
<button onclick={() => magazine.next()}>Next</button>
```

### Web Component (Angular, Solid, Lit, plain HTML)

```html
<script type="module">import 'foldable-magazine/element'</script>

<foldable-magazine style="height: 80vh" layout="auto" start-page="0" label="Spring issue">
  <img src="/pages/01.jpg" alt="Cover" />
  <img src="/pages/02.jpg" alt="" />
  <img src="/pages/03.jpg" alt="" />
</foldable-magazine>
```

You can give pages as `<img>` children, as a `pages` attribute (a JSON array or
comma-separated URLs), or through the `pages` property. Simple options are attributes:
`start-page`, `layout`, `spread-query`, `page-aspect`, `loop`, `bleed`, `label` and
`keyboard`. Everything else goes through the `options` property. The element has
`next()`, `prev()`, `goTo()`, `page`, `pageCount` and `instance`. It fires `pagechange`,
`ready` and `error` events, which bubble. To register it under another tag, call
`defineFoldableMagazine('my-tag')`.

**Angular**: import `foldable-magazine/element` once (for example in `main.ts`). Add
`CUSTOM_ELEMENTS_SCHEMA` to the component, then bind with
`[pages]="pages" (pagechange)="onPage($event.detail)"`.

**Solid**: `<foldable-magazine prop:pages={pages()} on:pagechange={(e) => setPage(e.detail.page)} />`.

## Sizing

The magazine fills the element you give it and keeps its proportions, centred.

- **Fixed size.** Give the element a width and height, for example `height: 80vh`.
- **Auto height.** If the element has no height of its own, the magazine takes its height
  from the width.
- **Bleed.** By default the open spread fits its pages to the element. Lifted pages and
  shadows then spill past it, as they would off a real table. Leave room around it and
  don't clip it with `overflow: hidden`. To keep everything inside the element, set
  `bleed: false`. The single layout already leaves room for its rolled pages, so its
  default is `false`.

## Options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `pages` | `PageSource[]` | **required** | Reading order, front cover first. URL strings, `<img>`, `<canvas>`, `ImageBitmap` or a three.js `Texture`. |
| `startPage` | `number` | `0` | 0-based page to open at. |
| `layout` | `'auto' \| 'spread' \| 'single'` | `'auto'` | |
| `spreadQuery` | `string` | `(min-width: 768px) and (orientation: landscape)` | When `auto` uses the spread layout. |
| `pageAspect` | `number` | `1.377` | Page height ÷ width. |
| `loop` | `boolean` | `true` | Single layout: after the last page, close and restart from the cover. |
| `bleed` | `boolean` | spread `true`, single `false` | See [Sizing](#sizing). |
| `paper` | `PaperOptions` | | See below. |
| `lighting` | `LightingOptions` | | See below. |
| `motion` | `MotionOptions` | | See below. |
| `interaction` | `InteractionOptions` | | See below. |
| `maxPixelRatio` | `number` | `2` | The canvas is also capped at about 15 megapixels. |
| `label` | `string` | `'Magazine'` | Accessible name. |
| `formatPageLabel` | `(detail) => string` | `"Pages 14–15 of 28"` | What screen readers hear when pages change. |
| `onPageChange` | `(detail) => void` | | Same as the `pagechange` event. |
| `onReady` | `() => void` | | The first pages are loaded and on screen. |
| `onError` | `(error, page?) => void` | | A page failed to load. It stays blank paper. |

**`paper`**

| | Default | |
| --- | --- | --- |
| `grain` | `true` | `false` turns it off. You can also pass a tiling greyscale image or its URL; only its brightest specks show. |
| `grainScale` | `1.46` | Tiles across a page. |
| `grainStrength` | `0.17` | How much the grain darkens. |
| `showThrough` | spread `0.04`, single `0.3` | How much of the other side shows through the paper. |
| `inkGloss` | `0.33` | How much glossier ink is than bare paper. |
| `roughness` / `metalness` | `0.5` / `0.17` | |
| `backColor` | `#fcfcf9` | The blank back of single-layout pages. |
| `wrinkles` | `1` | Waviness of resting sheets; `0` lays them flat. |
| `bulge` | `1` | How much pages rise off the spine. |

**`lighting`**: `ambient: { sky, ground, intensity }`, `sun: { color, intensity, position }`,
`shadows` (default `true`), `shadowMapSize` (default `2048`), and `floorShadow`. That last
one is the opacity of the shadow under the open spread, default `0.15`.

**`motion`**

| | Default | |
| --- | --- | --- |
| `speed` | `1` | Multiplies the speed of every turn. |
| `dragDistance` | spread `0.8`, single `1.2` | Share of the canvas width that drags a page all the way over. |
| `commitThreshold` | spread `0.2`, single `0.1` | How far a released drag must have turned to finish turning. |
| `curl` | `1` | How much a turning page bends. |
| `maxTilt` | spread `45`, single `35` | Degrees the fold tilts from where you hold it. |
| `jitter` | `true` | Small random differences, so no two turns look alike. |
| `hoverLift` | `0.03` | How far a hovered sheet lifts (spread). |
| `reducedMotion` | `'auto'` | Follows `prefers-reduced-motion`. Reduced motion means quicker turns, no hover lift and no hold-to-riffle. |

**`interaction`**: `drag`, `click`, `hold` and `hover` all default to `true`. `keyboard`
defaults to `true` (works while the magazine has focus); set it to `'global'` to listen on
the whole window (form fields are ignored).

## Methods, properties, events

```ts
magazine.next()                         // false at the end
magazine.prev()                         // false at the start
magazine.goTo(12)                       // jump
magazine.goTo(0, { animate: true })     // riffle back to the cover
magazine.update({ layout: 'single' })   // change options and keep the page
magazine.dispose()                      // remove everything, free the GPU

magazine.page          // first visible page, 0-based
magazine.visiblePages  // e.g. [13, 14]
magazine.pageCount
magazine.layout        // 'spread' | 'single'
magazine.element       // the focusable root, [data-foldable][data-layout][data-state]

magazine.addEventListener('pagechange', (e) => e.detail)  // { page, visiblePages, pageCount, layout }
magazine.addEventListener('ready', () => {})
magazine.addEventListener('error', (e) => e.detail)       // { error, page }
```

`update()` compares options by value. Changing callbacks or the label is free. Changing
`pages`, `layout`, paper, lighting, motion or interaction rebuilds the scene (a few
milliseconds) and keeps the reader on the same page. `startPage` only applies at creation;
use `goTo()` after that.

## Pages

- **Sources.** Use images in the page aspect (default 1 : 1.377). 1200–1600 px wide is
  plenty.
- **Cross-origin URLs.** URLs on another origin need CORS headers, because the images are
  uploaded to WebGL.
- **Load order.** Pages load nearest-first, four at a time. Pages that haven't arrived show
  blank paper.
- **Spread order.** In `spread`, the front cover sits alone on the right, then pages pair up
  as 1–2, 3–4, and so on. With an odd page count, the last sheet has a blank back.

## Accessibility

The magazine root is focusable (`tabindex="0"`) with `role="region"` and
`aria-roledescription="magazine"`. A polite live region announces the visible pages. Keys:
`←` / `→`, `PageUp` / `PageDown`, `Home` and `End`. Rendering pauses while the magazine is
off screen or the tab is hidden.

## Development

```bash
npm install
npm run dev          # demo playground: vanilla, React, Vue, Svelte and Web Component pages
npm run typecheck
npm run build        # dist/: ESM bundles + type declarations
npm run build:demo   # static demo site in dist-demo/
FOLDABLE_DIST=1 npx vite   # run the demo against the built dist/ instead of src/
```

How it works:

- `src/spread` and `src/single` hold each layout's engine (simulation and input) and its
  sheet shader.
- `src/paper` holds the shared paper material and the procedural grain.
- `FoldableMagazine.ts` handles the DOM, sizing, loading, layout switching, keyboard and
  events.

## Credits

The page deformation and interaction model are reverse-engineered from the magazine on
[paper.design/mono](https://paper.design/mono).
