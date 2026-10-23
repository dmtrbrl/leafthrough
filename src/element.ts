import { LeafThrough, type GoToOptions } from './LeafThrough.js'
import type { LeafThroughOptions, Layout, PageChangeDetail, PageSource } from './options.js'

export type * from './options.js'

// attribute → option, for the simple ones
const ATTRIBUTES = {
  'start-page': 'startPage',
  layout: 'layout',
  'spread-query': 'spreadQuery',
  'page-aspect': 'pageAspect',
  loop: 'loop',
  bleed: 'bleed',
  label: 'label',
  keyboard: 'keyboard',
} as const

const NUMBERS = new Set(['startPage', 'pageAspect'])
const BOOLEANS = new Set(['loop', 'bleed'])

const BaseElement = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement

/**
 * `<leaf-through>`: works anywhere HTML does, including Angular, Solid and Lit.
 *
 * Pages come from the `pages` property, a `pages` attribute (JSON array or comma-separated
 * URLs), or the element's `<img>` children. Everything else can be set through the
 * `options` property or the attributes `start-page`, `layout`, `spread-query`,
 * `page-aspect`, `loop`, `bleed`, `label` and `keyboard`.
 *
 * Events (all bubble): `pagechange` (detail: PageChangeDetail), `ready`, and `pageerror`
 * (detail: `{ error, page }`). It isn't called `error`, which on the DOM means a script
 * error and reaches `window`, where error trackers listen.
 *
 * ```html
 * <leaf-through style="height: 80vh" layout="auto">
 *   <img src="/pages/01.jpg" alt="Cover" />
 *   <img src="/pages/02.jpg" alt="" />
 * </leaf-through>
 * ```
 */
export interface LeafThroughElementEventMap extends HTMLElementEventMap {
  pagechange: CustomEvent<PageChangeDetail>
  ready: CustomEvent<void>
  pageerror: CustomEvent<{ error: unknown; page?: number }>
}

export class LeafThroughElement extends BaseElement {
  static observedAttributes = ['pages', ...Object.keys(ATTRIBUTES)]

  private magazine: LeafThrough | null = null
  private extra: Partial<LeafThroughOptions> = {}
  private explicitPages: PageSource[] | null = null
  private readonly mount: HTMLDivElement
  private childObserver: MutationObserver | null = null

  constructor() {
    super()
    const shadow = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = ':host{display:block;position:relative}:host([hidden]){display:none}div{width:100%;height:100%}'
    this.mount = document.createElement('div')
    // children stay in the light DOM as the page list (and as fallback content); hide them
    shadow.append(style, this.mount)

    // A property set before the element was defined is an own property that hides the
    // setter; move it through the setter, so later assignments reach the magazine.
    const self = this as unknown as Record<string, unknown>
    for (const key of ['pages', 'options']) {
      if (!Object.hasOwn(this, key)) continue
      const value = self[key]
      delete self[key]
      self[key] = value
    }
  }

  /** The pages, in reading order. */
  get pages(): PageSource[] {
    return this.explicitPages ?? this.pagesFromMarkup()
  }

  set pages(pages: PageSource[]) {
    this.explicitPages = pages
    this.sync()
  }

  /** Any other options, merged over the attributes. */
  get options(): Partial<LeafThroughOptions> {
    return this.extra
  }

  set options(options: Partial<LeafThroughOptions>) {
    this.extra = { ...options }
    if (options.pages) this.explicitPages = options.pages
    this.sync()
  }

  get page(): number {
    return this.magazine?.page ?? 0
  }

  get pageCount(): number {
    return this.pages.length
  }

  get layout(): Layout | undefined {
    return this.magazine?.layout
  }

  /** The underlying instance, once connected. */
  get instance(): LeafThrough | null {
    return this.magazine
  }

  next(): boolean {
    return this.magazine?.next() ?? false
  }

  prev(): boolean {
    return this.magazine?.prev() ?? false
  }

  goTo(page: number, options?: GoToOptions) {
    this.magazine?.goTo(page, options)
  }

  addEventListener<K extends keyof LeafThroughElementEventMap>(
    type: K,
    listener: (this: LeafThroughElement, event: LeafThroughElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    super.addEventListener(type, listener, options)
  }

  removeEventListener<K extends keyof LeafThroughElementEventMap>(
    type: K,
    listener: (this: LeafThroughElement, event: LeafThroughElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
    super.removeEventListener(type, listener, options)
  }

  connectedCallback() {
    this.childObserver = new MutationObserver(() => {
      if (!this.explicitPages) this.sync()
    })
    this.childObserver.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    this.sync()
  }

  disconnectedCallback() {
    this.childObserver?.disconnect()
    this.magazine?.dispose()
    this.magazine = null
  }

  attributeChangedCallback() {
    this.sync()
  }

  private pagesFromMarkup(): PageSource[] {
    const attribute = this.getAttribute('pages')
    if (attribute) {
      const trimmed = attribute.trim()
      if (trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed) as string[]
        } catch {
          return []
        }
      }
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return Array.from(this.querySelectorAll('img'), (img) => img.currentSrc || img.src).filter(Boolean)
  }

  private optionsFromAttributes(): Partial<LeafThroughOptions> {
    const out: Record<string, unknown> = {}
    for (const [attribute, key] of Object.entries(ATTRIBUTES)) {
      const value = this.getAttribute(attribute)
      if (value === null) continue
      if (NUMBERS.has(key)) out[key] = Number(value)
      else if (BOOLEANS.has(key)) out[key] = value !== 'false'
      else if (key === 'keyboard') {
        out.interaction = { keyboard: value === 'global' ? 'global' : value !== 'false' }
      } else out[key] = value
    }
    return out as Partial<LeafThroughOptions>
  }

  private sync() {
    if (!this.isConnected) return
    const pages = this.pages
    const attributes = this.optionsFromAttributes()
    const options: LeafThroughOptions = {
      ...attributes,
      ...this.extra,
      interaction: { ...attributes.interaction, ...this.extra.interaction },
      pages,
      onPageChange: (detail: PageChangeDetail) => {
        this.extra.onPageChange?.(detail)
        this.dispatchEvent(new CustomEvent('pagechange', { detail, bubbles: true, composed: true }))
      },
      onReady: () => {
        this.extra.onReady?.()
        this.dispatchEvent(new CustomEvent('ready', { bubbles: true, composed: true }))
      },
      onError: (error: unknown, page?: number) => {
        this.extra.onError?.(error, page)
        this.dispatchEvent(new CustomEvent('pageerror', { detail: { error, page }, bubbles: true, composed: true }))
      },
    }
    if (!pages.length) {
      this.magazine?.dispose()
      this.magazine = null
      return
    }
    if (this.magazine) this.magazine.setOptions(options)
    else this.magazine = new LeafThrough(this.mount, options)
  }
}

/** Registers the element (as `leaf-through` unless you pick another tag). */
export function defineLeafThrough(tagName = 'leaf-through') {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return
  customElements.define(tagName, class extends LeafThroughElement {})
}

defineLeafThrough()

declare global {
  interface HTMLElementTagNameMap {
    'leaf-through': LeafThroughElement
  }
}
