import * as THREE from 'three'
import type { Rect } from './framing.js'
import { isPageDescriptor, pageImage, type Layout, type PageDescriptor, type PageImage, type PageSource } from './options.js'

// plain view: page images kept after they leave the screen, so turning back doesn't load them again
const KEPT_IMAGES = 8

export const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'

export interface ContentState {
  pages: PageSource[]
  visiblePages: number[]
  layout: Layout
  /** Shows the page images (the plain view) instead of only describing them. */
  plain: boolean
  /** Accessible name of one page. */
  label: (page: number) => string
  /** Paper colour behind transparent page images, as a CSS colour. */
  paper: string
}

export interface ContentEvents {
  /** Plain view: a page image loaded (once per image; images shown recently are reused). */
  onLoad(page: number): void
  onError(page: number, error: unknown): void
  /** Plain view: every visible page has loaded or failed. */
  onShown(): void
}

/**
 * What's on the visible pages, as DOM. In 3D it's hidden and describes the pages for screen
 * readers (the canvas itself is hidden from them). In the plain view it shows the pages too.
 */
export class PageContent {
  readonly element = document.createElement('div')
  private key = ''
  private shown = 0
  // plain view: recently shown page images by source and alt, oldest first
  private readonly images = new Map<string, HTMLElement>()

  constructor(private readonly events: ContentEvents) {
    this.element.dataset.leafthroughContent = ''
    this.element.style.cssText = VISUALLY_HIDDEN
  }

  /** Brings the DOM up to date; cheap when nothing changed. */
  show(state: ContentState) {
    const { pages, visiblePages, layout, plain } = state
    const key = [
      plain,
      layout,
      state.paper,
      ...visiblePages.map((i) => {
        const page = pages[i]
        const info: Partial<PageDescriptor> = isPageDescriptor(page) ? page : {}
        return [i, sourceKey(pageImage(page)), info.alt, info.text, state.label(i)].join('\u0000')
      }),
    ].join('\u0001')
    if (key === this.key) return
    this.key = key

    const token = ++this.shown
    const used = new Set<HTMLElement>()
    let pending = 0
    const settle = () => {
      if (token === this.shown && --pending === 0) this.events.onShown()
    }
    const figures = visiblePages.flatMap((i) => {
      const page = pages[i]
      const { alt, text } = isPageDescriptor(page) ? page : { alt: undefined, text: undefined }
      // in 3D, a page with nothing to say needs nothing here; the live region gives its number
      if (!plain && !alt && !text) return []
      const figure = document.createElement('figure')
      figure.dataset.page = String(i)
      figure.setAttribute('aria-label', state.label(i))
      figure.style.cssText = 'margin:0'
      if (plain) {
        // a spread's cover sits alone on the right, then pages pair up as left 1, right 2, …
        const spread = layout === 'spread'
        const x = spread && i % 2 === 0 ? '50%' : '0'
        figure.style.cssText =
          `margin:0;position:absolute;top:0;left:${x};width:${spread ? '50%' : '100%'};height:100%;` +
          `background:${state.paper};box-shadow:0 1px 6px rgba(0,0,0,.18)`
        const image = this.imageFor(i, pageImage(page), alt, used)
        if (image instanceof HTMLImageElement && !image.complete) {
          pending++
          image.addEventListener('load', settle, { once: true })
          image.addEventListener('error', settle, { once: true })
        }
        figure.append(image)
      } else if (alt) {
        const image = document.createElement('span')
        image.setAttribute('role', 'img')
        image.setAttribute('aria-label', alt)
        figure.append(image)
      }
      if (text) figure.append(paragraphs(text, plain))
      return [figure]
    })
    this.element.replaceChildren(...figures)
    if (!pending) queueMicrotask(() => token === this.shown && this.events.onShown())
  }

  /** Rebuilds the DOM on the next show(), loading the images again. */
  refresh() {
    this.key = ''
    this.images.clear()
  }

  // a page image for the plain view, reused if it was shown recently (and isn't already in
  // `used`, as when two visible pages share an image)
  private imageFor(page: number, source: PageImage, alt = '', used: Set<HTMLElement>) {
    const key = `${sourceKey(source)}\u0000${alt}`
    let image = this.images.get(key)
    if (image && !used.has(image)) this.images.delete(key)
    else {
      const created = (image = displayImage(source, alt))
      if (created instanceof HTMLImageElement && !created.complete) {
        created.addEventListener('load', () => this.events.onLoad(page), { once: true })
        created.addEventListener('error', () => this.events.onError(page, new Error(`Failed to load page image: ${created.src}`)), {
          once: true,
        })
      } else queueMicrotask(() => this.events.onLoad(page))
    }
    used.add(image)
    this.images.set(key, image)
    if (this.images.size > KEPT_IMAGES) this.images.delete(this.images.keys().next().value!)
    return image
  }

  /** Plain view: where the pages go, in px relative to the root. `null` hides the content again. */
  place(box: Rect | null) {
    if (!box) {
      this.element.style.cssText = VISUALLY_HIDDEN
      return
    }
    const px = (n: number) => `${Math.round(n * 100) / 100}px`
    this.element.style.cssText = `position:absolute;left:${px(box.x)};top:${px(box.y)};width:${px(box.width)};height:${px(box.height)};pointer-events:none`
  }
}

const ids = new WeakMap<object, number>()
let nextId = 1
/** Identifies a page image: URLs by value, everything else by identity. */
export function sourceKey(source: PageImage) {
  if (typeof source === 'string') return source
  let id = ids.get(source)
  if (!id) ids.set(source, (id = nextId++))
  return `#${id}`
}

// the page's text, read by screen readers; hidden in the plain view, where the image shows it
function paragraphs(text: string, hidden: boolean) {
  const block = document.createElement('div')
  if (hidden) block.style.cssText = VISUALLY_HIDDEN
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = document.createElement('p')
    p.textContent = paragraph.trim()
    block.append(p)
  }
  return block
}

// an element showing the page image as it is now
function displayImage(source: PageImage, alt = ''): HTMLElement {
  const url = typeof source === 'string' ? source : source instanceof HTMLImageElement ? source.currentSrc || source.src : null
  const drawable = source instanceof THREE.Texture ? source.image : source
  const style = 'display:block;width:100%;height:100%'
  if (url === null && drawable instanceof HTMLImageElement) return displayImage(drawable, alt)
  if (url !== null) {
    const img = document.createElement('img')
    img.decoding = 'async'
    img.alt = alt
    img.draggable = false
    img.style.cssText = style
    img.src = url
    return img
  }
  if (typeof HTMLCanvasElement !== 'undefined' && (drawable instanceof HTMLCanvasElement || drawable instanceof ImageBitmap)) {
    // a copy, so the original stays where it is
    const canvas = document.createElement('canvas')
    canvas.width = drawable.width
    canvas.height = drawable.height
    canvas.getContext('2d')?.drawImage(drawable, 0, 0)
    return describe(canvas, alt, style)
  }
  // nothing drawable (a data texture, say): plain paper
  return describe(document.createElement('div'), alt, style)
}

// labels an element the way alt labels an image: without alt, it's decoration
function describe(element: HTMLElement, alt: string, style: string) {
  element.style.cssText = style
  if (alt) {
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', alt)
  } else element.setAttribute('aria-hidden', 'true')
  return element
}
