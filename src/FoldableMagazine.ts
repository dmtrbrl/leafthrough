import * as THREE from 'three'
import type { Engine } from './engine.js'
import { fit, framingFor, type Framing } from './framing.js'
import {
  DEFAULT_SPREAD_QUERY,
  defaultPageLabel,
  resolveSettings,
  type FoldableOptions,
  type Layout,
  type PageChangeDetail,
  type ResolvedSettings,
} from './options.js'
import { solidTexture } from './paper/paperMaterial.js'
import { createPaperPattern } from './paper/paperPattern.js'
import { SingleEngine } from './single/SingleEngine.js'
import { SpreadEngine } from './spread/SpreadEngine.js'
import { loadGrain, PageLoader } from './textures.js'

export interface FoldableEventMap {
  pagechange: CustomEvent<PageChangeDetail>
  ready: CustomEvent<void>
  error: CustomEvent<{ error: unknown; page?: number }>
}

export interface GoToOptions {
  /** Turn the pages one by one instead of jumping. Default `false`. */
  animate?: boolean
}

// options that only need storing, not a rebuild
const LIVE_KEYS = new Set<keyof FoldableOptions>(['onPageChange', 'onReady', 'onError', 'formatPageLabel', 'label', 'startPage'])

const isClient = typeof window !== 'undefined'

/**
 * A 3D magazine rendered into `container`. Size the container with CSS; the magazine
 * fits inside it (a container without a height takes its height from its width).
 *
 * ```ts
 * const magazine = new FoldableMagazine(document.querySelector('#magazine'), {
 *   pages: ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg'],
 * })
 * magazine.addEventListener('pagechange', (e) => console.log(e.detail.page))
 * ```
 */
export class FoldableMagazine extends EventTarget {
  readonly container: HTMLElement
  /** The element the magazine renders into; focusable, labelled, and styleable via `[data-foldable]`. */
  readonly element: HTMLDivElement

  private options: FoldableOptions
  private readonly canvas: HTMLCanvasElement
  private readonly hitArea: HTMLDivElement
  private readonly live: HTMLDivElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly blank: THREE.Texture
  private readonly backBlank: { texture: THREE.Texture; color: string }
  private pattern: { texture: THREE.Texture; key: unknown } | null = null
  private loader: PageLoader | null = null

  private view: {
    engine: Engine
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    framing: Framing
    settings: ResolvedSettings
    dispose: () => void
  } | null = null

  private spreadMedia: { list: MediaQueryList; abort: AbortController } | null = null
  private readonly motionMedia: MediaQueryList
  private readonly abort = new AbortController()
  private readonly resizeObserver: ResizeObserver
  private readonly intersection: IntersectionObserver
  private visible = true
  private needsRender = true
  private running = false
  // an animated goTo(): turn one page every `interval` ms until `target`
  private riffle: { target: number; interval: number; last: number } | null = null
  private lastPagesKey = ''
  private ready = false
  private disposed = false

  constructor(container: HTMLElement, options: FoldableOptions) {
    super()
    if (!isClient) throw new Error('FoldableMagazine needs a browser; create it on the client.')
    this.container = container
    this.options = { ...options }

    const element = (this.element = document.createElement('div'))
    element.dataset.foldable = ''
    element.dataset.state = 'loading'
    element.tabIndex = 0
    element.setAttribute('role', 'region')
    element.setAttribute('aria-roledescription', 'magazine')
    element.style.cssText = 'position:relative;width:100%;height:100%;outline-offset:4px;touch-action:pan-y pinch-zoom;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none'

    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'position:absolute;display:block;pointer-events:none;opacity:0;transition:opacity .4s'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.hitArea = document.createElement('div')
    this.hitArea.dataset.foldableHitArea = ''
    this.hitArea.style.cssText = 'position:absolute;cursor:grab;touch-action:pan-y pinch-zoom'
    this.live = document.createElement('div')
    this.live.setAttribute('aria-live', 'polite')
    this.live.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'
    element.append(this.canvas, this.hitArea, this.live)
    container.append(element)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // shadows only re-render on frames where something moved
    this.renderer.shadowMap.autoUpdate = false

    this.blank = solidTexture('#fcfcf9')
    const backColor = String(options.paper?.backColor ?? '#fcfcf9')
    this.backBlank = { texture: solidTexture(backColor), color: backColor }

    const signal = this.abort.signal
    this.watchSpreadQuery()
    this.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motionMedia.addEventListener('change', () => this.remount(), { signal })

    this.resizeObserver = new ResizeObserver(() => this.layoutBox())
    this.resizeObserver.observe(container)
    this.intersection = new IntersectionObserver(
      (entries) => {
        this.visible = entries[entries.length - 1].isIntersecting
        this.syncLoop()
      },
      { rootMargin: '50% 0px' },
    )
    this.intersection.observe(element)
    document.addEventListener('visibilitychange', () => this.syncLoop(), { signal })

    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), { signal })
    this.canvas.addEventListener('webglcontextrestored', () => (this.needsRender = true), { signal })
    this.bindKeyboard()

    this.applyLabel()
    this.loadPages(options.startPage ?? 0)
    this.remount(options.startPage ?? 0)
    this.syncLoop()
  }

  // --- public API -----------------------------------------------------------------

  /** First visible page, 0-based. */
  get page(): number {
    return this.detail().page
  }

  get pageCount(): number {
    return this.options.pages.length
  }

  get layout(): Layout {
    return this.view?.settings.layout ?? this.pickLayout()
  }

  get visiblePages(): number[] {
    return this.detail().visiblePages
  }

  /** Turns to the next page. Returns false at the end. */
  next(): boolean {
    this.stopRiffle()
    return this.view?.engine.flip(true) ?? false
  }

  /** Turns to the previous page. Returns false at the start. */
  prev(): boolean {
    this.stopRiffle()
    return this.view?.engine.flip(false) ?? false
  }

  /** Shows `page` (0-based), jumping there or turning the pages one by one. */
  goTo(page: number, { animate = false }: GoToOptions = {}) {
    if (!this.view) return
    this.stopRiffle()
    const engine = this.view.engine
    const target = this.pageToPosition(page, this.view.settings.layout)
    if (!animate) {
      engine.jumpTo(target)
      return
    }
    if (engine.position === target) return
    this.riffle = { target, interval: 140 / this.view.settings.motion.speed, last: -Infinity }
    this.needsRender = true
  }

  /** Changes options. Structural changes rebuild the scene and keep the current page. */
  update(options: Partial<FoldableOptions>) {
    if (this.disposed) return
    const previous = this.options
    const next = { ...previous, ...options }
    this.options = next

    const changed = (Object.keys(options) as (keyof FoldableOptions)[]).filter((key) => !deepEqual(previous[key], next[key]))
    if (!changed.length) return
    if (changed.includes('label') || changed.includes('formatPageLabel')) this.applyLabel()
    if (changed.includes('spreadQuery')) this.watchSpreadQuery()

    const page = this.page
    let rebuild = changed.some((key) => !LIVE_KEYS.has(key))
    if (changed.includes('pages') && this.pagesKey(next) !== this.lastPagesKey) {
      this.loadPages(page)
      rebuild = true
    }
    if (rebuild) this.remount(page)
  }

  addEventListener<K extends keyof FoldableEventMap>(
    type: K,
    listener: (event: FoldableEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    super.addEventListener(type, listener, options)
  }

  removeEventListener<K extends keyof FoldableEventMap>(
    type: K,
    listener: (event: FoldableEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    super.removeEventListener(type, listener, options)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.stopRiffle()
    this.renderer.setAnimationLoop(null)
    this.abort.abort()
    this.spreadMedia?.abort.abort()
    this.resizeObserver.disconnect()
    this.intersection.disconnect()
    this.view?.dispose()
    this.view = null
    this.loader?.dispose()
    this.pattern?.texture.dispose()
    this.blank.dispose()
    this.backBlank.texture.dispose()
    this.renderer.dispose()
    // free the GL context now; browsers only allow a handful at once
    this.renderer.forceContextLoss()
    this.element.remove()
  }

  // --- layout and scene -------------------------------------------------------------

  private pickLayout(): Layout {
    const layout = this.options.layout ?? 'auto'
    if (layout !== 'auto') return layout
    return this.spreadMedia?.list.matches ? 'spread' : 'single'
  }

  private watchSpreadQuery() {
    this.spreadMedia?.abort.abort()
    const list = window.matchMedia(this.options.spreadQuery ?? DEFAULT_SPREAD_QUERY)
    const abort = new AbortController()
    list.addEventListener('change', () => this.remount(), { signal: abort.signal })
    this.spreadMedia = { list, abort }
  }

  private remount(page = this.page) {
    if (this.disposed) return
    this.stopRiffle()
    this.view?.dispose()

    const layout = this.pickLayout()
    const settings = resolveSettings(this.options, layout, this.motionMedia.matches)
    const framing = framingFor(layout, settings.pageAspect)
    this.element.dataset.layout = layout
    this.hitArea.style.inset = ''
    const { drag, click, hold } = settings.interaction
    this.hitArea.style.cursor = drag ? 'grab' : click || hold ? 'pointer' : 'default'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(framing.fov, framing.view.width / framing.view.height, framing.distance * 0.05, framing.distance + 6)
    const cx = framing.view.x + framing.view.width / 2
    const cy = framing.view.y + framing.view.height / 2
    camera.position.set(cx, cy, framing.distance)
    camera.lookAt(cx, cy, 0)

    const { ambient, sun: sunOptions, shadows } = settings.lighting
    // the floor is the XY plane and +Z points at the viewer; the hemisphere keeps its
    // default +Y "up", so page faces get an even mix of sky and ground
    scene.add(new THREE.HemisphereLight(ambient.sky, ambient.ground, ambient.intensity))
    const sun = new THREE.DirectionalLight(sunOptions.color, sunOptions.intensity)
    sun.position.set(...sunOptions.position)
    sun.castShadow = shadows
    if (layout === 'single') sun.shadow.intensity = 0.4
    sun.shadow.mapSize.set(settings.lighting.shadowMapSize, settings.lighting.shadowMapSize)
    Object.assign(sun.shadow.camera, framing.shadow, { near: 0.5, far: 12 })
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.bias = -0.001
    scene.add(sun, sun.target)

    let floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | null = null
    if (layout === 'spread' && shadows && settings.lighting.floorShadow > 0) {
      floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: settings.lighting.floorShadow }))
      floor.position.z = -1e-5
      floor.receiveShadow = true
      scene.add(floor)
    }

    const pages = this.options.pages
    const textures = pages.map((_, i) => this.loader?.textures[i] ?? this.blank)
    const backColor = String(settings.paper.backColor)
    if (backColor !== this.backBlank.color) {
      this.backBlank.texture.dispose()
      this.backBlank.texture = solidTexture(backColor)
      this.backBlank.color = backColor
    }
    const ctx = {
      camera,
      canvas: this.canvas,
      hitArea: this.hitArea,
      settings,
      textures,
      blank: layout === 'single' ? this.backBlank.texture : this.blank,
      pattern: this.patternFor(settings),
      position: this.pageToPosition(page, layout),
    }
    const engine: Engine = layout === 'spread' ? new SpreadEngine(ctx) : new SingleEngine(ctx)
    scene.add(engine.group)

    this.view = {
      engine,
      scene,
      camera,
      framing,
      settings,
      dispose: () => {
        engine.dispose()
        sun.shadow.dispose()
        floor?.geometry.dispose()
        floor?.material.dispose()
      },
    }
    this.layoutBox()
    this.needsRender = true
  }

  private patternFor(settings: ResolvedSettings): THREE.Texture {
    const grain = settings.paper.grain
    const key = grain === true || grain === undefined ? 'builtin' : grain === false ? 'none' : grain
    if (this.pattern?.key === key) return this.pattern.texture
    this.pattern?.texture.dispose()
    let texture: THREE.Texture
    if (key === 'builtin') texture = createPaperPattern(this.renderer)
    else if (key === 'none') texture = solidTexture('#000000')
    else {
      // until the custom grain arrives, use none
      texture = solidTexture('#000000')
      loadGrain(key as string | HTMLImageElement | HTMLCanvasElement).then(
        (loaded) => {
          if (this.pattern?.key !== key || this.disposed) return loaded.dispose()
          this.pattern.texture.dispose()
          this.pattern.texture = loaded
          this.remount()
        },
        (error) => this.fail(error),
      )
    }
    this.pattern = { texture, key }
    return texture
  }

  // sizes the canvas and hit area to the container
  private layoutBox() {
    if (!this.view) return
    const { element } = this
    element.style.height = '100%'
    const width = element.clientWidth
    const height = element.clientHeight
    if (!width) return
    const box = fit(this.view.framing, width, height, this.view.settings.bleed)
    if (!height) element.style.height = `${Math.round(box.height)}px`

    const px = (n: number) => `${Math.round(n * 100) / 100}px`
    Object.assign(this.canvas.style, {
      left: px(box.canvas.x),
      top: px(box.canvas.y),
      width: px(box.canvas.width),
      height: px(box.canvas.height),
    })
    // the open spread takes input over the pages; one page at a time takes it over the
    // whole view, so the strip left of the spine can turn back
    const hit = this.view.settings.layout === 'spread' ? box.content : box.canvas
    Object.assign(this.hitArea.style, { left: px(hit.x), top: px(hit.y), width: px(hit.width), height: px(hit.height) })

    const maxRatio = Math.min(devicePixelRatio, this.view.settings.maxPixelRatio)
    const budget = Math.sqrt(15e6 / Math.max(1, box.canvas.width * box.canvas.height))
    this.renderer.setPixelRatio(Math.min(maxRatio, budget))
    this.renderer.setSize(Math.max(1, Math.round(box.canvas.width)), Math.max(1, Math.round(box.canvas.height)), false)
    this.view.camera.aspect = box.canvas.width / box.canvas.height
    this.view.camera.updateProjectionMatrix()
    this.needsRender = true
  }

  // --- pages ---------------------------------------------------------------------

  private pagesKey(options: FoldableOptions) {
    return options.pages.map((p) => (typeof p === 'string' ? p : `#${objectId(p)}`)).join('\n')
  }

  private loadPages(around: number) {
    this.loader?.dispose()
    this.lastPagesKey = this.pagesKey(this.options)
    const loader = new PageLoader(
      this.options.pages,
      this.renderer,
      (page, texture) => {
        if (this.loader !== loader) return
        this.view?.engine.setPageTexture(page, texture)
        this.needsRender = true
      },
      (page, error) => this.fail(error, page),
    )
    this.loader = loader
    this.ready = false
    this.element.dataset.state = 'loading'
    const first = [around - 1, around, around + 1, around + 2]
    loader.start(around, first).then(() => {
      if (this.loader !== loader || this.disposed) return
      this.ready = true
      this.needsRender = true
    })
  }

  private fail(error: unknown, page?: number) {
    if (this.options.onError) this.options.onError(error, page)
    else console.warn('[foldable-magazine]', error)
    this.dispatchEvent(new CustomEvent('error', { detail: { error, page } }))
  }

  // --- pages ↔ engine positions -------------------------------------------------------

  private pageToPosition(page: number, layout: Layout) {
    const count = this.options.pages.length
    const p = THREE.MathUtils.clamp(Math.round(page), 0, Math.max(count - 1, 0))
    return layout === 'spread' ? Math.ceil(p / 2) : p
  }

  private positionToPage(position: number, layout: Layout) {
    return layout === 'spread' ? Math.max(0, 2 * position - 1) : position
  }

  private detail(): PageChangeDetail {
    const count = this.options.pages.length
    const layout = this.view?.settings.layout ?? this.pickLayout()
    const position = this.view?.engine.position ?? 0
    const candidates = layout === 'spread' ? [2 * position - 1, 2 * position] : [position]
    const visiblePages = candidates.filter((p) => p >= 0 && p < count)
    const page = visiblePages.length ? visiblePages[0] : Math.max(0, Math.min(this.positionToPage(position, layout), count - 1))
    return { page, visiblePages, pageCount: count, layout }
  }

  private lastDetailKey = ''

  private emitPageChange() {
    const detail = this.detail()
    const key = `${detail.layout}:${detail.visiblePages.join(',')}`
    if (key === this.lastDetailKey) return
    const first = !this.lastDetailKey
    this.lastDetailKey = key
    this.live.textContent = (this.options.formatPageLabel ?? defaultPageLabel)(detail)
    if (first) return
    this.options.onPageChange?.(detail)
    this.dispatchEvent(new CustomEvent('pagechange', { detail }))
  }

  private applyLabel() {
    this.element.setAttribute('aria-label', this.options.label ?? 'Magazine')
    this.lastDetailKey = ''
  }

  // --- input and loop -----------------------------------------------------------------

  private bindKeyboard() {
    const handler = (e: KeyboardEvent) => {
      const mode = this.view?.settings.interaction.keyboard
      if (!mode || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (mode === 'global') {
        const target = e.target as HTMLElement | null
        if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
      } else if (e.currentTarget !== this.element) return
      const last = this.pageCount - 1
      const actions: Record<string, () => unknown> = {
        ArrowRight: () => this.next(),
        PageDown: () => this.next(),
        ArrowLeft: () => this.prev(),
        PageUp: () => this.prev(),
        Home: () => this.goTo(0),
        End: () => this.goTo(last),
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    this.element.addEventListener('keydown', handler, { signal: this.abort.signal })
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.view?.settings.interaction.keyboard === 'global' && !this.element.contains(e.target as Node)) handler(e)
      },
      { signal: this.abort.signal },
    )
  }

  private stopRiffle() {
    this.riffle = null
  }

  private stepRiffle(now: number, engine: Engine) {
    const riffle = this.riffle
    if (!riffle || now - riffle.last < riffle.interval) return
    if (engine.position === riffle.target) {
      this.riffle = null
      return
    }
    riffle.last = now
    if (!engine.flip(engine.position < riffle.target)) this.riffle = null
  }

  // only animate while the magazine is on screen and the tab is visible
  private syncLoop() {
    const run = this.visible && !document.hidden && !this.disposed
    if (run === this.running) return
    this.running = run
    this.renderer.setAnimationLoop(run ? (now) => this.frame(now) : null)
    if (run) this.needsRender = true
  }

  private frame(now: number) {
    const view = this.view
    if (!view) return
    this.stepRiffle(now, view.engine)
    const moved = view.engine.update(now)
    if (moved || this.needsRender) {
      this.renderer.shadowMap.needsUpdate = true
      this.renderer.render(view.scene, view.camera)
      this.needsRender = false
      if (this.ready && this.element.dataset.state !== 'ready') {
        this.element.dataset.state = 'ready'
        this.canvas.style.opacity = '1'
        this.options.onReady?.()
        this.dispatchEvent(new CustomEvent('ready'))
      }
    }
    this.emitPageChange()
  }
}

// --- helpers ---------------------------------------------------------------------

const ids = new WeakMap<object, number>()
let nextId = 1
function objectId(value: object) {
  let id = ids.get(value)
  if (!id) ids.set(value, (id = nextId++))
  return id
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const protoA = Object.getPrototypeOf(a)
  if (protoA !== Object.prototype && protoA !== Array.prototype) return false
  if (protoA !== Object.getPrototypeOf(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}
