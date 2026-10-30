import * as THREE from 'three'
import { PageContent, sourceKey, VISUALLY_HIDDEN } from './content.js'
import { rayThrough, type Engine } from './engine.js'
import { fit, framingFor, plainFramingFor, type Framing, type Rect } from './framing.js'
import { bindKeyboard, pageDetail, pagesAt, pageToPosition, Riffle } from './navigation.js'
import {
  changedOptions,
  DEFAULT_SPREAD_QUERY,
  defaultPageLabel,
  LIVE_OPTIONS,
  pageImage,
  preloadRadius,
  resolveSettings,
  snapshot,
  type LeafThroughOptions,
  type Layout,
  type PageChangeDetail,
  type ResolvedSettings,
} from './options.js'
import { colorKey, PaperTextures } from './paper/paperTextures.js'
import { PlainEngine } from './plain/PlainEngine.js'
import { SingleEngine } from './single/SingleEngine.js'
import { SpreadEngine } from './spread/SpreadEngine.js'
import { PageLoader } from './textures.js'

export interface LeafThroughEventMap {
  pagechange: CustomEvent<PageChangeDetail>
  ready: CustomEvent<void>
  pageload: CustomEvent<{ page: number }>
  error: CustomEvent<{ error: unknown; page?: number }>
}

export interface GoToOptions {
  /** Turn the pages one by one instead of jumping. Default `false`. */
  animate?: boolean
}

const isClient = typeof window !== 'undefined'

/**
 * A 3D magazine rendered into `container`. Size the container with CSS; the magazine
 * fits inside it (a container without a height takes its height from its width).
 *
 * ```ts
 * const magazine = new LeafThrough(document.querySelector('#magazine'), {
 *   pages: ['/pages/01.jpg', '/pages/02.jpg', '/pages/03.jpg'],
 * })
 * magazine.addEventListener('pagechange', (e) => console.log(e.detail.page))
 * ```
 */
export class LeafThrough extends EventTarget {
  readonly container: HTMLElement
  /** The element the magazine renders into; focusable, labelled, and styleable via `[data-leafthrough]`. */
  readonly element: HTMLDivElement

  private options: LeafThroughOptions
  private readonly canvas: HTMLCanvasElement
  private readonly hitArea: HTMLDivElement
  private readonly live: HTMLDivElement
  private readonly content: PageContent
  // null when the browser can't run WebGL; the magazine then shows plain pages
  private readonly renderer: THREE.WebGLRenderer | null
  private frameRequest = 0
  private readonly paper: PaperTextures
  private loader: PageLoader | null = null

  private view: {
    engine: Engine
    // null in the plain view
    scene: THREE.Scene | null
    camera: THREE.PerspectiveCamera | null
    framing: Framing
    settings: ResolvedSettings
    dispose: () => void
  } | null = null

  private spreadMedia: { list: MediaQueryList; abort: AbortController } | null = null
  private readonly motionMedia: MediaQueryList
  private readonly abort = new AbortController()
  private readonly resizeObserver: ResizeObserver
  private readonly metrics = { dragWidth: 1 }
  private hitBox: Rect | null = null
  private hitSide: 'both' | 'right' | 'left' = 'both'
  private readonly intersection: IntersectionObserver
  private visible = true
  private needsRender = true
  private running = false
  private readonly riffle = new Riffle()
  private lastPagesKey = ''
  private ready = false
  private disposed = false

  constructor(container: HTMLElement, options: LeafThroughOptions) {
    super()
    if (!isClient) throw new Error('LeafThrough needs a browser; create it on the client.')
    this.container = container
    this.options = snapshot(options)

    const element = (this.element = document.createElement('div'))
    element.dataset.leafthrough = ''
    element.dataset.state = 'loading'
    element.tabIndex = 0
    element.setAttribute('role', 'region')
    element.setAttribute('aria-roledescription', 'magazine')
    element.style.cssText = 'position:relative;width:100%;height:100%;outline-offset:4px;touch-action:pan-y pinch-zoom;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none'

    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'position:absolute;display:block;pointer-events:none;opacity:0;transition:opacity .4s'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.hitArea = document.createElement('div')
    this.hitArea.dataset.leafthroughHitArea = ''
    this.hitArea.style.cssText = 'position:absolute;cursor:grab;touch-action:pan-y pinch-zoom'
    this.live = document.createElement('div')
    this.live.setAttribute('aria-live', 'polite')
    this.live.style.cssText = VISUALLY_HIDDEN
    this.content = new PageContent({
      onLoad: (page) => !this.disposed && this.pageLoaded(page),
      onError: (page, error) => !this.disposed && this.fail(error, page),
      onShown: () => {
        if (!this.plain) return
        this.ready = true
        this.needsRender = true
      },
    })
    element.append(this.canvas, this.content.element, this.hitArea, this.live)

    this.renderer = createRenderer(this.canvas)
    container.append(element)

    this.paper = new PaperTextures(options.paper?.backColor ?? '#fcfcf9', {
      onGrain: () => this.remount(),
      onError: (error) => this.fail(error),
    })

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
    // the canvas is clipped to the document, which can move without the container resizing
    window.addEventListener('resize', () => this.layoutBox(), { signal })
    window.addEventListener('online', () => this.retry(), { signal })

    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), { signal })
    this.canvas.addEventListener('webglcontextrestored', () => (this.needsRender = true), { signal })
    this.bindKeyboard()

    this.applyLabel()
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

  /** True while showing flat pages: the `plain` option is on, or the browser can't run WebGL. */
  get plain(): boolean {
    return !this.renderer || !!this.options.plain
  }

  /** True while a page is being dragged or is completing its turn. */
  get turning(): boolean {
    return this.view?.engine.turning ?? false
  }

  /** Turns to the next page. Returns false at the end. */
  next(): boolean {
    this.riffle.stop()
    return this.view?.engine.flip(true) ?? false
  }

  /** Turns to the previous page. Returns false at the start. */
  prev(): boolean {
    this.riffle.stop()
    return this.view?.engine.flip(false) ?? false
  }

  /** Shows `page` (0-based), jumping there or turning the pages one by one. */
  goTo(page: number, { animate = false }: GoToOptions = {}) {
    if (!this.view || Number.isNaN(page)) return
    this.riffle.stop()
    const engine = this.view.engine
    const target = this.pageToPosition(page, this.view.settings.layout)
    if (!animate) {
      engine.jumpTo(target)
      return
    }
    if (engine.position === target) return
    this.riffle.start(target, this.view.settings.motion.speed)
    this.needsRender = true
  }

  /** Loads the pages that failed again. Also happens by itself when the browser comes back online. */
  retry() {
    this.loader?.retry()
    if (this.plain) this.content.refresh()
  }

  /** Changes some options and keeps the rest. Structural changes rebuild the scene and keep the current page. */
  update(options: Partial<LeafThroughOptions>) {
    this.applyOptions({ ...this.options, ...options })
  }

  /**
   * Replaces every option at once: anything left out goes back to its default. Bindings
   * use this, since props describe the whole state. Structural changes rebuild the scene
   * and keep the current page.
   */
  setOptions(options: LeafThroughOptions) {
    this.applyOptions(options)
  }

  private applyOptions(options: LeafThroughOptions) {
    if (this.disposed) return
    const previous = this.options
    const next = (this.options = snapshot(options))

    const changed = changedOptions(previous, next)
    if (!changed.length) return
    if (changed.includes('label') || changed.includes('formatPageLabel')) this.applyLabel()
    if (changed.includes('spreadQuery')) this.watchSpreadQuery()

    const page = this.page
    let rebuild = changed.some((key) => !LIVE_OPTIONS.has(key))
    // new images load from scratch; a change to only alt or text just updates the content
    if (changed.includes('pages') && this.pagesKey(next) !== this.lastPagesKey) {
      this.loader?.dispose()
      this.loader = null
      this.resetReady()
      rebuild = true
    }
    if (changed.includes('preload')) this.loader?.setRadius(preloadRadius(this.options.preload))
    if (rebuild) this.remount(page)
  }

  addEventListener<K extends keyof LeafThroughEventMap>(
    type: K,
    listener: (event: LeafThroughEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    super.addEventListener(type, listener, options)
  }

  removeEventListener<K extends keyof LeafThroughEventMap>(
    type: K,
    listener: (event: LeafThroughEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    super.removeEventListener(type, listener, options)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.riffle.stop()
    this.setLoop(null)
    this.abort.abort()
    this.spreadMedia?.abort.abort()
    this.resizeObserver.disconnect()
    this.intersection.disconnect()
    this.view?.dispose()
    this.view = null
    this.loader?.dispose()
    this.paper.dispose()
    this.renderer?.dispose()
    // free the GL context now; browsers only allow a handful at once
    this.renderer?.forceContextLoss()
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
    this.riffle.stop()
    const wasPlain = this.view?.engine instanceof PlainEngine
    this.view?.dispose()

    const layout = this.pickLayout()
    const settings = resolveSettings(this.options, layout, this.motionMedia.matches)
    this.element.dataset.layout = layout
    this.lastPagesKey = this.pagesKey(this.options)
    this.view = this.renderer && !this.options.plain
      ? this.createScene(this.renderer, page, layout, settings)
      : this.createPlain(page, layout, settings, wasPlain)
    this.layoutBox()
    this.needsRender = true
  }

  private createPlain(page: number, layout: Layout, settings: ResolvedSettings, wasPlain: boolean) {
    // the plain view draws no textures
    this.loader?.dispose()
    this.loader = null
    if (!wasPlain) this.resetReady()
    this.element.dataset.plain = ''
    this.canvas.style.display = 'none'
    const { drag, click } = settings.interaction
    this.hitArea.style.cursor = drag || click ? 'pointer' : 'default'
    const engine = new PlainEngine({
      hitArea: this.hitArea,
      settings,
      pageCount: this.options.pages.length,
      position: this.pageToPosition(page, layout),
    })
    return {
      engine,
      scene: null,
      camera: null,
      framing: plainFramingFor(layout, settings.pageAspect),
      settings,
      dispose: () => engine.dispose(),
    }
  }

  private createScene(renderer: THREE.WebGLRenderer, page: number, layout: Layout, settings: ResolvedSettings) {
    delete this.element.dataset.plain
    this.canvas.style.display = 'block'
    this.content.place(null)
    if (!this.loader) this.loadPages(renderer, page, layout)
    this.loader?.setWrap(layout === 'single' && settings.loop)
    const framing = framingFor(layout, settings.pageAspect)
    const { drag, click, hold } = settings.interaction
    this.hitArea.style.cursor = drag ? 'grab' : click || hold ? 'pointer' : 'default'

    const scene = new THREE.Scene()
    // the frustum is set up in layoutBox(), once we know which part of the view is visible
    // Clip planes hug what a page can reach (about a page width towards the camera, a little
    // behind the floor): the tighter they are, the finer the depth buffer near the spine.
    const camera = new THREE.PerspectiveCamera(40, 1, Math.max(0.1, framing.distance - 1.8), framing.distance + 2)
    camera.position.set(framing.eye.x, framing.eye.y, framing.distance)
    camera.lookAt(framing.eye.x, framing.eye.y, 0)

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
    const shading = {
      spineContact: { value: new THREE.Vector3(1, 0, 0) },
      lightDirection: { value: sun.position.clone().sub(sun.target.position).normalize() },
      origin: { value: new THREE.Vector3() },
    }

    let floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | null = null
    if (layout === 'spread' && shadows && settings.lighting.floorShadow > 0) {
      floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: settings.lighting.floorShadow }))
      floor.position.z = -1e-5
      floor.receiveShadow = true
      scene.add(floor)
    }

    const blank = this.paper.blank
    const textures = this.options.pages.map((_, i) => this.loader?.textures[i] ?? blank)
    const ctx = {
      input: {
        element: this.hitArea,
        ray: (x: number, y: number, ray: THREE.Ray) => rayThrough(camera, this.canvas, x, y, ray),
        // the hit area itself covers just the pages
        covers: () => true,
      },
      settings,
      textures,
      blank: layout === 'single' ? this.paper.back(settings.paper.backColor) : blank,
      pattern: this.paper.grain(settings, renderer),
      position: this.pageToPosition(page, layout),
      metrics: this.metrics,
      shading,
      // the loop draws every frame the engine asks for while the magazine is on screen
      requestFrame: () => {},
    }
    const engine: Engine = layout === 'spread' ? new SpreadEngine(ctx) : new SingleEngine(ctx)
    scene.add(engine.group)

    return {
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
  }

  // sizes the canvas and hit area to the container
  private layoutBox() {
    if (!this.view) return
    const { element } = this
    const { framing, settings, camera } = this.view
    element.style.height = '100%'
    const width = element.clientWidth
    const height = element.clientHeight
    if (!width) return
    const placed = fit(framing, width, height, settings.bleed)
    if (!height) element.style.height = `${Math.round(placed.height)}px`
    this.metrics.dragWidth = framing.dragWidth * placed.scale
    this.hitBox = placed.box
    this.placeHitArea()
    this.needsRender = true
    if (!camera || !this.renderer) {
      // the plain view: the pages are DOM, laid out over the box
      this.content.place(placed.box)
      return
    }

    // A bleeding view can reach past the edges of the page; past the sides that would
    // add a horizontal scrollbar, so the canvas stops at the document's edges and the
    // camera renders just that part of the view. The edges are measured in the element's own
    // pixels, which a CSS transform on the container (say, a scale) makes differ from the screen's.
    const root = element.getBoundingClientRect()
    const scaleX = root.width / element.offsetWidth || 1
    const scaleY = root.height / element.offsetHeight || 1
    const pageLeft = root.left + window.scrollX
    const pageTop = root.top + window.scrollY
    const documentWidth = document.documentElement.clientWidth
    const left = Math.max(placed.view.x, -pageLeft / scaleX)
    const right = Math.min(placed.view.x + placed.view.width, (documentWidth - pageLeft) / scaleX)
    const top = Math.max(placed.view.y, -pageTop / scaleY)
    const bottom = placed.view.y + placed.view.height
    const canvas = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }

    const px = (n: number) => `${Math.round(n * 100) / 100}px`
    Object.assign(this.canvas.style, {
      left: px(canvas.x),
      top: px(canvas.y),
      width: px(canvas.width),
      height: px(canvas.height),
    })

    const maxRatio = Math.min(devicePixelRatio, settings.maxPixelRatio)
    const budget = Math.sqrt(15e6 / Math.max(1, canvas.width * canvas.height))
    this.renderer.setPixelRatio(Math.min(maxRatio, budget))
    this.renderer.setSize(Math.max(1, Math.round(canvas.width)), Math.max(1, Math.round(canvas.height)), false)

    // A frustum centred on the eye that covers the whole view, then cropped to the canvas.
    const { eye, view, distance } = framing
    const halfWidth = Math.max(eye.x - view.x, view.x + view.width - eye.x)
    const halfHeight = Math.max(eye.y - view.y, view.y + view.height - eye.y)
    const scale = placed.scale
    camera.fov = (2 * Math.atan(halfHeight / distance) * 180) / Math.PI
    camera.aspect = halfWidth / halfHeight
    // where the frustum's top-left corner (eye.x - halfWidth, eye.y + halfHeight) lands, in px
    const frustumLeft = placed.view.x + (eye.x - halfWidth - view.x) * scale
    const frustumTop = placed.view.y + (view.y + view.height - (eye.y + halfHeight)) * scale
    camera.setViewOffset(
      2 * halfWidth * scale,
      2 * halfHeight * scale,
      canvas.x - frustumLeft,
      canvas.y - frustumTop,
      canvas.width,
      canvas.height,
    )
    camera.updateProjectionMatrix()
  }

  // --- pages ---------------------------------------------------------------------

  // what the pages show; their alt and text don't count
  private pagesKey(options: LeafThroughOptions) {
    return options.pages.map((p) => sourceKey(pageImage(p))).join('\n')
  }

  private loadPages(renderer: THREE.WebGLRenderer, around: number, layout: Layout) {
    this.loader?.dispose()
    const loader = new PageLoader(this.options.pages.map(pageImage), renderer, preloadRadius(this.options.preload), {
      onLoad: (page, texture) => {
        if (this.loader !== loader) return
        this.view?.engine.setPageTexture(page, texture)
        this.needsRender = true
        this.pageLoaded(page)
      },
      onUnload: (page) => {
        if (this.loader !== loader) return
        this.view?.engine.setPageTexture(page, this.paper.blank)
        this.needsRender = true
      },
      onError: (page, error) => this.fail(error, page),
    })
    this.loader = loader
    this.inView = ''
    this.resetReady()
    // the pages around the start, so the first turn either way has its next page ready
    const first = [around - 1, around, around + 1, around + 2]
    const visible = this.pagesAt(this.pageToPosition(around, layout), layout)
    loader.start(visible[0] ?? around, visible[visible.length - 1] ?? around, first).then(() => {
      if (this.loader !== loader || this.disposed) return
      this.ready = true
      this.needsRender = true
    })
  }

  // loads around what's on screen, pages mid-turn included, the page being read first
  private inView = ''
  private followReader(engine: Engine, layout: Layout) {
    if (!this.loader) return
    const { from, to } = engine.pagesInView()
    const around = this.pagesAt(engine.position, layout)[0] ?? to
    const key = `${from}:${to}:${around}`
    if (key === this.inView) return
    this.inView = key
    this.loader.focus(from, to, around)
  }

  private resetReady() {
    this.ready = false
    this.element.dataset.state = 'loading'
  }

  private pageLoaded(page: number) {
    this.options.onPageLoad?.(page)
    this.dispatchEvent(new CustomEvent('pageload', { detail: { page } }))
  }

  private fail(error: unknown, page?: number) {
    if (this.options.onError) this.options.onError(error, page)
    else console.warn('[leafthrough]', error)
    this.dispatchEvent(new CustomEvent('error', { detail: { error, page } }))
  }

  // --- pages ↔ engine positions -------------------------------------------------------

  private pageToPosition(page: number, layout: Layout) {
    return pageToPosition(page, layout, this.options.pages.length)
  }

  private pagesAt(position: number, layout: Layout) {
    return pagesAt(position, layout, this.options.pages.length)
  }

  private detail(): PageChangeDetail {
    const layout = this.view?.settings.layout ?? this.pickLayout()
    return pageDetail(this.view?.engine.position ?? 0, layout, this.options.pages.length)
  }

  private lastDetailKey = ''

  private emitPageChange() {
    const detail = this.detail()
    const key = `${detail.layout}:${detail.visiblePages.join(',')}/${detail.pageCount}`
    if (key === this.lastDetailKey) return
    const first = !this.lastDetailKey
    this.lastDetailKey = key
    this.live.textContent = (this.options.formatPageLabel ?? defaultPageLabel)(detail)
    if (first) return
    this.options.onPageChange?.(detail)
    this.dispatchEvent(new CustomEvent('pagechange', { detail }))
  }

  // the visible pages' content, for screen readers and the plain view
  private syncContent(view: NonNullable<typeof this.view>) {
    const { visiblePages, pageCount, layout } = this.detail()
    const format = this.options.formatPageLabel ?? defaultPageLabel
    this.content.show({
      pages: this.options.pages,
      visiblePages,
      layout,
      plain: this.plain,
      label: (page) => format({ page, visiblePages: [page], pageCount, layout }),
      paper: `#${colorKey(view.settings.paper.backColor)}`,
    })
  }

  private applyLabel() {
    this.element.setAttribute('aria-label', this.options.label ?? 'Magazine')
    this.lastDetailKey = ''
  }

  // --- input and loop -----------------------------------------------------------------

  private bindKeyboard() {
    bindKeyboard(
      this.element,
      () => this.view?.settings.interaction.keyboard,
      { next: () => this.next(), prev: () => this.prev(), first: () => this.goTo(0), last: () => this.goTo(this.pageCount - 1) },
      this.abort.signal,
    )
  }

  // only animate while the magazine is on screen and the tab is visible
  private syncLoop() {
    const run = this.visible && !document.hidden && !this.disposed
    if (run === this.running) return
    this.running = run
    this.setLoop(run ? (now) => this.frame(now) : null)
    if (run) this.needsRender = true
  }

  // the renderer's animation loop, or plain requestAnimationFrame without one
  private setLoop(callback: ((now: number) => void) | null) {
    if (this.renderer) return this.renderer.setAnimationLoop(callback)
    cancelAnimationFrame(this.frameRequest)
    if (!callback) return
    const tick = (now: number) => {
      this.frameRequest = requestAnimationFrame(tick)
      callback(now)
    }
    this.frameRequest = requestAnimationFrame(tick)
  }

  // The hit area covers the pages; a closed magazine only takes input on its cover side.
  // This is the only place that positions it.
  private placeHitArea() {
    const box = this.hitBox
    const side = this.view?.engine.activeSide ?? 'both'
    if (!box) return
    this.hitSide = side
    const half = side === 'both' ? 1 : 0.5
    const px = (n: number) => `${Math.round(n * 100) / 100}px`
    Object.assign(this.hitArea.style, {
      left: px(side === 'right' ? box.x + box.width / 2 : box.x),
      top: px(box.y),
      width: px(box.width * half),
      height: px(box.height),
    })
  }

  private frame(now: number) {
    const view = this.view
    if (!view) return
    this.riffle.step(now, view.engine)
    const moved = view.engine.update(now)
    this.followReader(view.engine, view.settings.layout)
    if (view.engine.activeSide !== this.hitSide) this.placeHitArea()
    if (moved || this.needsRender) {
      if (this.renderer && view.scene && view.camera) {
        this.renderer.shadowMap.needsUpdate = true
        this.renderer.render(view.scene, view.camera)
      }
      this.needsRender = false
      if (this.ready && this.element.dataset.state !== 'ready') {
        this.element.dataset.state = 'ready'
        this.canvas.style.opacity = '1'
        this.options.onReady?.()
        this.dispatchEvent(new CustomEvent('ready'))
      }
    }
    this.emitPageChange()
    this.syncContent(view)
  }
}

// --- helpers ---------------------------------------------------------------------

// null when the browser can't run WebGL
function createRenderer(canvas: HTMLCanvasElement) {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return null
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  // shadows only re-render on frames where something moved
  renderer.shadowMap.autoUpdate = false
  return renderer
}
