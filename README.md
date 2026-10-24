# LeafThrough

A 3D magazine you can flip through. Pages are printed paper: they bend, roll, catch the
light and cast shadows. Built on three.js, written in TypeScript, with bindings for React,
Vue, Svelte, and a Web Component for everything else (Angular, Solid, Lit, plain HTML).

**[Live demo](https://dmtrbrl.github.io/leafthrough/)**, with one page per binding and a dev panel
for every option, method and event.

- **Two layouts.** `spread` is an open magazine with sheets turning over the spine.
  `single` shows one page at a time, and read pages roll up behind the magazine. `auto`
  picks between them with a media query.
- **Real paper feel.** Pages bulge off the spine and nest on the stacks. They bend while
  turning and fold towards wherever you hold them. Paper grain, glossy ink and a little
  show-through complete the look.
- **Drag, click, press and hold, or keys.** Drags follow your hand, and a released page
  falls with the speed you gave it.
- **Customizable** paper, lighting, motion, interactions and page shape.
- **Accessible.** Keyboard control, screen reader announcements, page descriptions and
  text for screen readers, reduced motion support, and a plain view without 3D.
- **Big magazines.** Pages load nearest first and unload when the reader is far away, so
  memory stays flat however long the issue.

## Install

```bash
npm install leafthrough three
```

`three` (r160 or newer) is a peer dependency. React, Vue and Svelte are optional peers;
install only the one you use.

## Quick start

Every binding renders into an element you size with CSS. The magazine fits itself inside
(see [Sizing](#sizing)).

### Vanilla

```ts
import { LeafThrough } from 'leafthrough'

const magazine = new LeafThrough(document.querySelector('#magazine')!, {
  pages: ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg', '/pages/04.jpg'],
})

magazine.addEventListener('pagechange', (e) => console.log(e.detail.visiblePages))
document.querySelector('#next')!.addEventListener('click', () => magazine.next())
```

### React (18+)

```tsx
import { useRef } from 'react'
import { LeafThrough, type LeafThroughHandle } from 'leafthrough/react'

export function Issue({ pages }: { pages: string[] }) {
  const magazine = useRef<LeafThroughHandle>(null)
  return (
    <>
      <LeafThrough ref={magazine} pages={pages} style={{ height: '80vh' }} onPageChange={(d) => console.log(d.page)} />
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
import { LeafThrough } from 'leafthrough/vue'

const magazine = ref()
const pages = ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg']
</script>

<template>
  <LeafThrough ref="magazine" :pages="pages" style="height: 80vh" @pagechange="(d) => console.log(d.page)" />
  <button @click="magazine.next()">Next</button>
</template>
```

The template ref exposes `next()`, `prev()`, `goTo()` and `instance`. Events are
`pagechange`, `ready` and `error`.

### Svelte (4 and 5)

```svelte
<script lang="ts">
  import { leafThrough, type LeafThrough } from 'leafthrough/svelte'

  const pages = ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg']
  let magazine: LeafThrough
</script>

<div style="height: 80vh" use:leafThrough={{ pages, onInit: (m) => (magazine = m) }}></div>
<button onclick={() => magazine.next()}>Next</button>
```

### Web Component (Angular, Solid, Lit, plain HTML)

```html
<script type="module">import 'leafthrough/element'</script>

<leaf-through style="height: 80vh" layout="auto" start-page="0" label="Spring issue">
  <img src="/pages/01.jpg" alt="Cover: a lighthouse at dusk" />
  <figure>
    <img src="/pages/02.jpg" alt="" />
    <figcaption>Contents. 3: The keeper's year. 7: Charts of the coast.</figcaption>
  </figure>
  <img src="/pages/03.jpg" alt="" />
</leaf-through>
```

You can give pages as `<img>` children, as a `pages` attribute (a JSON array or
comma-separated URLs), or through the `pages` property. An image's `alt` describes its
page, and a `<figcaption>` beside it in a `<figure>` gives the page's text (see
[Accessibility](#accessibility)). Simple options are attributes: `start-page`, `layout`,
`spread-query`, `page-aspect`, `loop`, `bleed`, `label`, `keyboard`, `preload` and `plain`.
Everything else goes through the `options` property. The element has `next()`, `prev()`,
`goTo()`, `page`, `pageCount` and `instance`. It fires `pagechange`, `ready`, `pageload`
(detail `{ page }`) and `pageerror` (detail `{ error, page }`) events, which bubble. The last one isn't
called `error`, because on the DOM that means a script error and reaches `window`, where
error trackers listen. To register the element under another tag, call
`defineLeafThrough('my-tag')`.

**Angular**: import `leafthrough/element` once (for example in `main.ts`). Add
`CUSTOM_ELEMENTS_SCHEMA` to the component, then bind with
`[pages]="pages" (pagechange)="onPage($event.detail)"`.

**Solid**: `<leaf-through prop:pages={pages()} on:pagechange={(e) => setPage(e.detail.page)} />`.

## Sizing

The magazine fills the element you give it and keeps its proportions, centred.

- **Fixed size.** Give the element a width and height, for example `height: 80vh`.
- **Auto height.** If the element has no height of its own, the magazine takes its height
  from the width.
- **Bleed.** By default the magazine fits the element, and turning pages and shadows spill
  past it, as they would off a real table. In the single layout, a turning page swings
  out to the left of the spine. The spill stops at the edges of the document, so it never
  adds a horizontal scrollbar; on a phone the page sweeps off the screen edge. Don't clip
  the element with `overflow: hidden`. To keep everything inside the element, set
  `bleed: false`; the pages then come out smaller.

## Options

| Option            | Type                             | Default                                           |                                                                                                            |
| ----------------- | -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pages`           | `PageSource[]`                   | **required**                                      | Reading order, front cover first. URL strings, `<img>`, `<canvas>`, `ImageBitmap`, a three.js `Texture`, or `{ src, alt, text }` (see [Pages](#pages)). |
| `startPage`       | `number`                         | `0`                                               | 0-based page to open at.                                                                                   |
| `layout`          | `'auto' \| 'spread' \| 'single'` | `'auto'`                                          |                                                                                                            |
| `spreadQuery`     | `string`                         | `(min-width: 768px) and (orientation: landscape)` | When `auto` uses the spread layout.                                                                        |
| `pageAspect`      | `number`                         | `1.377`                                           | Page height ÷ width.                                                                                       |
| `loop`            | `boolean`                        | `true`                                            | Single layout: after the last page, close and restart from the cover.                                      |
| `bleed`           | `boolean`                        | `true`                                            | See [Sizing](#sizing).                                                                                     |
| `paper`           | `PaperOptions`                   |                                                   | See below.                                                                                                 |
| `lighting`        | `LightingOptions`                |                                                   | See below.                                                                                                 |
| `motion`          | `MotionOptions`                  |                                                   | See below.                                                                                                 |
| `interaction`     | `InteractionOptions`             |                                                   | See below.                                                                                                 |
| `maxPixelRatio`   | `number`                         | `3`                                               | The canvas is also capped at about 15 megapixels.                                                          |
| `preload`         | `number`                         | `6`                                               | Pages either side of the visible ones (mid-turn and rolled-up ones included) to load ahead. Pages twice as far away unload. `Infinity` keeps all. |
| `plain`           | `boolean`                        | `false`                                           | Flat pages without 3D. Used by itself when the browser can't run WebGL.                                    |
| `label`           | `string`                         | `'Magazine'`                                      | Accessible name.                                                                                           |
| `formatPageLabel` | `(detail) => string`             | `"Pages 14–15 of 28"`                             | What screen readers hear when pages change.                                                                |
| `onPageChange`    | `(detail) => void`               |                                                   | Same as the `pagechange` event.                                                                            |
| `onReady`         | `() => void`                     |                                                   | The first pages are loaded and on screen.                                                                  |
| `onPageLoad`      | `(page) => void`                 |                                                   | A page's image loaded. Same as the `pageload` event.                                                       |
| `onError`         | `(error, page?) => void`         |                                                   | A page failed to load. It stays blank paper until `retry()`.                                               |

**`paper`**

|                           | Default                     |                                                                                                              |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `grain`                   | `true`                      | `false` turns it off. You can also pass a tiling greyscale image or its URL; only its brightest specks show. |
| `grainScale`              | `1.46`                      | Tiles across a page.                                                                                         |
| `grainStrength`           | `0.17`                      | How much the grain darkens.                                                                                  |
| `showThrough`             | spread `0.04`, single `0.3` | How much of the other side shows through the paper.                                                          |
| `inkGloss`                | `0.33`                      | How much glossier ink is than bare paper.                                                                    |
| `roughness` / `metalness` | `0.5` / `0.17`              |                                                                                                              |
| `backColor`               | `#fcfcf9`                   | Unprinted paper: the blank back of single-layout pages, and transparent parts of page images.                |
| `wrinkles`                | `1`                         | Waviness of resting sheets; `0` lays them flat.                                                              |
| `bulge`                   | `1`                         | How much pages rise off the spine.                                                                           |

**`lighting`**: `ambient: { sky, ground, intensity }`, `sun: { color, intensity, position }`,
`shadows` (default `true`), `shadowMapSize` (default `2048`), and `floorShadow`. That last
one is the opacity of the shadow under the open spread, default `0.15`.

**`motion`**

|                   | Default                    |                                                                                                            |
| ----------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `speed`           | `1`                        | Multiplies the speed of every turn.                                                                        |
| `dragDistance`    | spread `0.8`, single `1.2` | Share of the canvas width that drags a page all the way over.                                              |
| `commitThreshold` | spread `0.2`, single `0.1` | How far a released drag must have turned to finish turning.                                                |
| `curl`            | `1`                        | How much a turning page bends.                                                                             |
| `maxTilt`         | spread `45`, single `35`   | Degrees the fold tilts from where you hold it.                                                             |
| `jitter`          | `true`                     | Small random differences, so no two turns look alike.                                                      |
| `hoverLift`       | `0.03`                     | How far a hovered sheet lifts (spread).                                                                    |
| `reducedMotion`   | `'auto'`                   | Follows `prefers-reduced-motion`. Reduced motion means quicker turns, no hover lift and no hold-to-riffle. |

**`interaction`**: `drag`, `click`, `hold` and `hover` all default to `true`. `keyboard`
defaults to `true` (works while the magazine has focus); set it to `'global'` to listen on
the whole window (form fields are ignored).

## Methods, properties, events

```ts
magazine.next()                         // false at the end
magazine.prev()                         // false at the start
magazine.goTo(12)                       // jump
magazine.goTo(0, { animate: true })     // riffle back to the cover
magazine.update({ layout: 'single' })   // change some options, keep the rest and the page
magazine.setOptions({ pages })          // replace all options: anything left out goes back to its default
magazine.retry()                        // load failed pages again (also happens when the browser comes back online)
magazine.dispose()                      // remove everything, free the GPU

magazine.page          // first visible page, 0-based
magazine.visiblePages  // e.g. [13, 14]
magazine.pageCount
magazine.layout        // 'spread' | 'single'
magazine.plain         // true while showing flat pages (by choice, or without WebGL)
magazine.turning       // true while a page is dragged or still finishing its turn
magazine.element       // the focusable root, [data-leafthrough][data-layout][data-state][data-plain]

magazine.addEventListener('pagechange', (e) => e.detail)  // { page, visiblePages, pageCount, layout }
magazine.addEventListener('ready', () => {})
magazine.addEventListener('pageload', (e) => e.detail)    // { page }
magazine.addEventListener('error', (e) => e.detail)       // { error, page }
```

Both compare options by value. Changing callbacks or the label is free. Changing `pages`,
`layout`, paper, lighting, motion or interaction rebuilds the scene (a few milliseconds)
and keeps the reader on the same page. `startPage` only applies at creation; use `goTo()`
after that. The React, Vue and Svelte bindings and the element use `setOptions()`, so
removing a prop or attribute restores its default. Options are copied on every call, so an
object or array changed in place and passed again (as Vue's reactive props are) counts as
a change.

When the browser can't run WebGL, the magazine shows plain pages instead (see
[Accessibility](#accessibility)); `magazine.plain` tells you so.

## Pages

```ts
pages: [
  { src: '/pages/01.jpg', alt: 'Cover: a lighthouse at dusk' },
  { src: '/pages/02.jpg', alt: 'Contents', text: "Inside this issue.\n\n3: The keeper's year." },
  '/pages/03.jpg',
]
```

- **Sources.** Use images in the page aspect (default 1 : 1.377). 1200–1600 px wide is
  plenty.
- **Descriptions.** A page can be `{ src, alt, text }`: `alt` describes it like an image's
  alt text, and `text` is what's printed on it (blank lines separate paragraphs). Screen
  readers get both, and changing them doesn't reload anything.
- **Transparent artwork.** PNG and WebP alpha is composited onto the paper: transparent
  areas are unprinted paper in `paper.backColor`, including when the reverse side shows
  through.
- **Cross-origin URLs.** URLs on another origin need CORS headers, because the images are
  uploaded to WebGL.
- **Textures.** A three.js `Texture` you pass in is never disposed, but the magazine sets its
  `colorSpace`, `premultiplyAlpha` and `anisotropy`. Give it a texture of its own if you
  use the same one elsewhere.
- **Load order.** Pages load nearest the reader first, four at a time, and the order follows
  the reader as they turn or jump. Pages that haven't arrived show blank paper.
- **Memory.** Pages within `preload` of the visible ones load; pages more than twice that
  far away unload, freeing their GPU memory, and load again when the reader comes back.
  Visible means anything on screen: pages still turning in a quick riffle, and in `single`
  the read pages rolled up behind the magazine, until they settle under the pile.
  A texture you pass in yourself stays loaded, since it's yours.
- **Failures.** A page that fails stays blank paper and is reported through `onError`.
  `retry()` loads failed pages again, and so does the browser coming back online.
- **Spread order.** In `spread`, the front cover sits alone on the right, then pages pair up
  as 1–2, 3–4, and so on. With an odd page count, the last sheet has a blank back.

## Accessibility

The magazine root is focusable (`tabindex="0"`) with `role="region"` and
`aria-roledescription="magazine"`. A polite live region announces the visible pages. Keys:
`←` / `→`, `PageUp` / `PageDown`, `Home` and `End`. Rendering pauses while the magazine is
off screen or the tab is hidden.

The 3D canvas is hidden from screen readers, so give pages an `alt` and their `text` (see
[Pages](#pages)). The magazine keeps the visible pages' descriptions and text in the page,
visually hidden, where screen readers can read them; each page is a `figure` named by
`formatPageLabel`.

**Plain view.** `plain: true` shows the pages as flat images, with the same layouts,
navigation, keyboard and events, and no 3D. Clicking the right half turns forward, the left
half back, and a swipe turns its way. Offer it as a setting for readers who prefer it. The
magazine also switches to it by itself when the browser can't run WebGL.

## Development

```bash
npm install
npm run dev          # demo playground: a page per binding, each with the dev panel
npm run typecheck
npm test             # browser tests in headless Chromium (first run: npx playwright install chromium)
npm run build        # dist/: ESM bundles + type declarations
npm run build:demo   # static demo site in dist-demo/ (published to GitHub Pages on every push to main)
LEAFTHROUGH_DIST=1 npx vite   # run the demo against the built dist/ instead of src/
```

How it works:

- `demo/pages.ts` exports the twelve-page LeafThrough magazine: image URLs with alt text and each page's printed copy.
  Its final PNGs and consolidated `PROMPTS.md` live in `demo/assets/magazine/`.
  Pastel photographic collages alternate with editorial copy about pages and motion,
  with a contents page, running headings, and numbered interior footers. Pages 4–5
  and 8–9 use softer charcoal paper and ivory pencil marks; light pages and covers
  retain transparency. Each PNG includes its artwork and text, preserving the original
  varied collage layouts and proportional sans typography. Running headers and footers
  use exact shared pixel coordinates, documented in `PROMPTS.md` and `alignment.json`.

- `src/spread` and `src/single` hold each layout's engine (simulation and input) and its
  sheet shader. `src/plain` holds the plain view's engine.
- `content.ts` keeps the visible pages' content as DOM: hidden for screen readers in 3D,
  the pages themselves in the plain view.
- `textures.ts` loads, prioritises and unloads page textures.
- `src/paper` holds the shared paper material and the procedural grain.
- `LeafThrough.ts` handles the DOM, sizing, loading, layout switching, keyboard and
  events.

## Credits

The page deformation and interaction model are reverse-engineered from the magazine on
[paper.design/mono](https://paper.design/mono).

## License

[MIT](LICENSE)
