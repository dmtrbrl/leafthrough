import * as THREE from 'three'
import { sourceKey } from './content.js'
import { floorPoint, rayThrough, type Engine } from './engine.js'
import { framingFor, plainFramingFor, type Framing, type Rect } from './framing.js'
import type { GoToOptions } from './LeafThrough.js'
import { bindKeyboard, pageDetail, pagesAt, pageToPosition, Riffle } from './navigation.js'
import {
  changedOptions,
  deepEqual,
  DEFAULT_SPREAD_QUERY,
  LIVE_OPTIONS,
  pageImage,
  preloadRadius,
  resolveSettings,
  snapshot,
  type LeafThroughOptions,
  type Layout,
  type PageChangeDetail,
  type PaperDeform,
  type ResolvedSettings,
} from './options.js'
import { PaperTextures } from './paper/paperTextures.js'
import { SingleEngine } from './single/SingleEngine.js'
import { SpreadEngine } from './spread/SpreadEngine.js'
import { PageLoader } from './textures.js'

/**
 * The magazine's options, less those about its own canvas and DOM. Of `lighting`, only
 * `shadows` (whether sheets cast and receive them) and `sun.position` apply: the lights are
 * your scene's. Point `sun.position` towards your shadow-casting directional light, in the
 * magazine's own frame; it places the shadow a turning sheet casts right by the spine.
 * `lighting.shadows` changes without a rebuild.
 *
 * Its sheets stand apart by default (`paper.sheetGap` `0.0005`, about 0.1 mm paper on a
 * 210 mm page) and `paper.depthBias` is off, so they sort by real depth from any side.
 */
export type LeafThroughObjectOptions = Omit<LeafThroughOptions, 'bleed' | 'maxPixelRatio' | 'plain' | 'label' | 'formatPageLabel'> & {
  /** Reshapes the paper in your own GLSL. Experimental. */
  deform?: PaperDeform
}

const SHEET_GAP = 0.0005

/** What the magazine draws with, from your scene. */
export interface LeafThroughObjectContext {
  /** The renderer drawing your scene. Pages load into it. */
  renderer: THREE.WebGLRenderer
  /** The camera your scene is drawn with. Pointer input is cast from it; change it later through `camera`. */
  camera: THREE.Camera
  /**
   * Takes pointer input, and keys with `interaction.keyboard: true` while it has focus. It must
   * show the camera's whole view. Default `renderer.domElement`.
   */
  domElement?: HTMLElement
}

export interface LeafThroughObjectEventMap extends THREE.Object3DEventMap {
  pagechange: { detail: PageChangeDetail }
  ready: {}
  pageload: { detail: { page: number } }
  error: { detail: { error: unknown; page?: number } }
  /** Something changed between frames: draw one, and keep drawing while `tick()` returns true. */
  change: {}
}

/** Where the magazine lies in its own units. */
export interface LeafThroughBounds {
  /** The pages at rest: what to frame. */
  pages: Rect
  /** Everything a turning page can sweep through. */
  reach: Rect
}

const isClient = typeof window !== 'undefined'

/**
 * A 3D magazine to add to your own three.js scene. It draws nothing itself: call `tick()`
 * every frame you render, and render again whenever it fires `change`.
 *
 * In its own units a page is 1 wide and `pageAspect` tall, the spine runs up the y axis at
 * x = 0, and the pages lie on the z = 0 plane facing +z. Move, turn and scale it like any
 * object. Pointer input is cast through `camera` onto the pages, wherever they are.
 *
 * ```ts
 * const magazine = new LeafThroughObject({ renderer, camera }, { pages, layout: 'spread' })
 * scene.add(magazine)
 * renderer.setAnimationLoop((now) => {
 *   magazine.tick(now)
 *   renderer.render(scene, camera)
 * })
 * ```
 */
export class LeafThroughObject extends THREE.Group<LeafThroughObjectEventMap> {
  /** The camera your scene is drawn with; pointer input is cast from it. */
  camera: THREE.Camera
  readonly domElement: HTMLElement
  private inputEnabled = true

  /**
   * Whether it takes pointer and key input. Turn it off while it's tucked away or moving,
   * and on again; the pages stay as they are. Turning it off lets go of a page being held.
   * Default `true`.
   */
  get enabled() {
    return this.inputEnabled
  }
  set enabled(value: boolean) {
    if (this.inputEnabled && !value) this.view?.engine.cancelInput?.()
    this.inputEnabled = value
  }

  private readonly renderer: THREE.WebGLRenderer
  private options: LeafThroughObjectOptions
  private readonly paper: PaperTextures
  private loader: PageLoader | null = null
  private view: { engine: Engine; settings: ResolvedSettings; framing: Framing; dispose: () => void } | null = null

  private spreadMedia: { list: MediaQueryList; abort: AbortController } | null = null
  private readonly motionMedia: MediaQueryList
  private readonly abort = new AbortController()
  private readonly riffle = new Riffle()
  private readonly metrics: { readonly dragWidth: number; dragDelta(dx: number, dy: number): number }
  private readonly ray = new THREE.Ray()
  private readonly point = new THREE.Vector3()
  private readonly ends = [new THREE.Vector3(), new THREE.Vector3()]
  private needsRender = true
  private lastPagesKey = ''
  private lastDetailKey = ''
  private inView = ''
  private ready = false
  private readyFired = false
  private disposed = false

  constructor({ renderer, camera, domElement = renderer.domElement }: LeafThroughObjectContext, options: LeafThroughObjectOptions) {
    super()
    if (!isClient) throw new Error('LeafThrough needs a browser; create it on the client.')
    this.renderer = renderer
    this.camera = camera
    this.domElement = domElement
    this.options = copyOptions(options)
    const object = this
    this.metrics = {
      get dragWidth() {
        return object.dragWidth()
      },
      dragDelta(dx, dy) {
        const axis = object.pageAxis()
        return (dx * axis.x + dy * axis.y) / (axis.length() || 1)
      },
    }

    this.paper = new PaperTextures(options.paper?.backColor ?? '#fcfcf9', {
      onGrain: () => this.remount(),
      onError: (error) => this.fail(error),
    })

    const signal = this.abort.signal
    this.watchSpreadQuery()
    this.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motionMedia.addEventListener('change', () => this.remount(), { signal })
    window.addEventListener('online', () => this.retry(), { signal })
    bindKeyboard(
      domElement,
      () => (this.enabled && this.shown() ? this.view?.settings.interaction.keyboard : false),
      { next: () => this.next(), prev: () => this.prev(), first: () => this.goTo(0), last: () => this.goTo(this.pageCount - 1) },
      signal,
    )

    this.remount(options.startPage ?? 0)
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

  /** True while a page is being dragged or is completing its turn. */
  get turning(): boolean {
    return this.view?.engine.turning ?? false
  }

  /**
   * Where the magazine lies in its own units: frame `pages` with your camera. Changes with
   * the layout, which `'auto'` can switch as the window resizes.
   */
  get bounds(): LeafThroughBounds {
    const layout = this.layout
    const aspect = this.view?.settings.pageAspect ?? this.resolve(layout).pageAspect
    return { pages: plainFramingFor(layout, aspect).box, reach: framingFor(layout, aspect).view }
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
    const target = pageToPosition(page, this.view.settings.layout, this.pageCount)
    if (!animate) {
      engine.jumpTo(target)
      return
    }
    if (engine.position === target) return
    this.riffle.start(target, this.view.settings.motion.speed)
    this.requestFrame()
  }

  /** Loads the pages that failed again. Also happens by itself when the browser comes back online. */
  retry() {
    this.loader?.retry()
  }

  /** Changes some options and keeps the rest. Structural changes rebuild the pages and keep the current page. */
  update(options: Partial<LeafThroughObjectOptions>) {
    this.applyOptions({ ...this.options, ...options })
  }

  /** Replaces every option at once: anything left out goes back to its default. */
  setOptions(options: LeafThroughObjectOptions) {
    this.applyOptions(options)
  }

  /**
   * Whether a press at this point on screen lands on the magazine, which then takes it. Check
   * it in your own pointer handlers to leave such presses alone. False while it's hidden or
   * not `enabled`.
   */
  covers(clientX: number, clientY: number): boolean {
    const view = this.view
    if (!view || !this.enabled || !this.shown()) return false
    if (!rayThrough(this.camera, this.domElement, clientX, clientY, this.ray)) return false
    const point = floorPoint(view.engine.group, this.ray, this.point)
    if (!point) return false
    // a closed spread only turns from its cover side
    const box = view.framing.box
    const side = view.engine.activeSide
    const left = side === 'right' ? box.x + box.width / 2 : box.x
    const right = side === 'left' ? box.x + box.width / 2 : box.x + box.width
    return point.x >= left && point.x <= right && point.y >= box.y && point.y <= box.y + box.height
  }

  /**
   * Advances the pages to `now` (a `requestAnimationFrame` timestamp). Call it every frame
   * before rendering. Returns true while the pages are moving and need another frame.
   */
  tick(now = performance.now()): boolean {
    const view = this.view
    if (!view) return false
    this.riffle.step(now, view.engine)
    const moved = view.engine.update(now)
    this.followReader(view.engine, view.settings.layout)
    const draw = moved || this.needsRender
    this.needsRender = false
    if (this.ready && !this.readyFired) {
      this.readyFired = true
      this.options.onReady?.()
      this.dispatchEvent({ type: 'ready' })
    }
    this.emitPageChange()
    return draw || this.riffle.active
  }

  /** Frees the pages, textures and listeners, and takes the magazine out of its parent. */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.riffle.stop()
    this.abort.abort()
    this.spreadMedia?.abort.abort()
    this.view?.dispose()
    this.view = null
    this.loader?.dispose()
    this.paper.dispose()
    this.removeFromParent()
  }

  // --- options and layout -----------------------------------------------------------

  private applyOptions(options: LeafThroughObjectOptions) {
    if (this.disposed) return
    const previous = this.options
    const next = (this.options = copyOptions(options))
    const changed = changedOptions(previous, next)
    if (!changed.length) return
    if (changed.includes('spreadQuery')) this.watchSpreadQuery()

    // shadows turn on and off in place; the rest of lighting rebuilds
    const { shadows: wasShadowed, ...lighting } = previous.lighting ?? {}
    const { shadows: shadowed, ...nextLighting } = next.lighting ?? {}
    const liveShadows = changed.includes('lighting') && deepEqual(lighting, nextLighting)
    if (liveShadows && (wasShadowed ?? true) !== (shadowed ?? true)) this.view?.engine.setShadows?.(shadowed ?? true)

    const page = this.page
    let rebuild = changed.some((key) => {
      if (key === 'deform') return deformKey(previous) !== deformKey(next)
      if (key === 'lighting') return !liveShadows
      return !LIVE_OPTIONS.has(key)
    })
    if (changed.includes('pages') && this.pagesKey(next) !== this.lastPagesKey) {
      this.loader?.dispose()
      this.loader = null
      rebuild = true
    }
    if (changed.includes('preload')) this.loader?.setRadius(preloadRadius(this.options.preload))
    if (rebuild) this.remount(page)
  }

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
    this.view?.dispose()

    const layout = this.pickLayout()
    const settings = this.resolve(layout)
    this.lastPagesKey = this.pagesKey(this.options)
    if (!this.loader) this.loadPages(page, layout)
    this.loader?.setWrap(layout === 'single' && settings.loop)

    const domElement = this.domElement
    const blank = this.paper.blank
    const ctx = {
      input: {
        element: domElement,
        ray: (x: number, y: number, ray: THREE.Ray) => rayThrough(this.camera, domElement, x, y, ray),
        covers: (x: number, y: number) => this.covers(x, y),
      },
      settings,
      textures: this.options.pages.map((_, i) => this.loader?.textures[i] ?? blank),
      blank: layout === 'single' ? this.paper.back(settings.paper.backColor) : blank,
      pattern: this.paper.grain(settings, this.renderer),
      position: pageToPosition(page, layout, this.pageCount),
      metrics: this.metrics,
      shading: {
        spineContact: { value: new THREE.Vector3(1, 0, 0) },
        lightDirection: { value: new THREE.Vector3(...settings.lighting.sun.position).normalize() },
        origin: { value: new THREE.Vector3() },
      },
      requestFrame: () => this.requestFrame(),
    }
    const engine: Engine = layout === 'spread' ? new SpreadEngine(ctx) : new SingleEngine(ctx)
    this.add(engine.group)
    this.view = {
      engine,
      settings,
      framing: framingFor(layout, settings.pageAspect),
      dispose: () => {
        this.remove(engine.group)
        engine.dispose()
      },
    }
    this.requestFrame()
  }

  // the settings, with this object's own defaults and its deform
  private resolve(layout: Layout): ResolvedSettings {
    const settings = resolveSettings(this.options, layout, this.motionMedia.matches)
    const paper = this.options.paper
    settings.paper.sheetGap = Math.max(0, paper?.sheetGap ?? SHEET_GAP)
    settings.paper.depthBias = paper?.depthBias ?? false
    const deform = this.options.deform
    if (deform) {
      // The shaders read each uniform through the options as they are now, so a value set on
      // the caller's own object, or an object swapped in by update(), shows on the next frame.
      const uniforms: Record<string, THREE.IUniform> = {}
      for (const name of Object.keys(deform.uniforms ?? {})) {
        const options = () => this.options
        uniforms[name] = {
          get value() {
            return options().deform?.uniforms?.[name]?.value
          },
        }
      }
      settings.deform = { glsl: deform.glsl, uniforms }
    }
    return settings
  }

  // A drag across this many pixels turns a page all the way: the magazine's drag width, at the
  // size it shows on screen now.
  private readonly axis = new THREE.Vector2()

  private pageAxis() {
    const group = this.view?.engine.group ?? this
    group.updateWorldMatrix(true, false)
    this.camera.updateWorldMatrix(true, false)
    const rect = this.domElement.getBoundingClientRect()
    const [spine, edge] = this.ends.map((end, x) => end.set(x, 0, 0).applyMatrix4(group.matrixWorld).project(this.camera))
    return this.axis.set(((edge.x - spine.x) * rect.width) / 2, -((edge.y - spine.y) * rect.height) / 2)
  }

  private dragWidth() {
    return Math.max(1, (this.view?.framing.dragWidth ?? 1) * this.pageAxis().length())
  }

  // whether this and every parent are visible
  private shown() {
    for (let object: THREE.Object3D | null = this; object; object = object.parent) if (!object.visible) return false
    return true
  }

  private requestFrame() {
    this.needsRender = true
    this.dispatchEvent({ type: 'change' })
  }

  // --- pages ---------------------------------------------------------------------

  // what the pages show; their alt and text don't count
  private pagesKey(options: LeafThroughObjectOptions) {
    return options.pages.map((p) => sourceKey(pageImage(p))).join('\n')
  }

  private loadPages(around: number, layout: Layout) {
    this.loader?.dispose()
    const loader = new PageLoader(this.options.pages.map(pageImage), this.renderer, preloadRadius(this.options.preload), {
      onLoad: (page, texture) => {
        if (this.loader !== loader) return
        this.view?.engine.setPageTexture(page, texture)
        this.options.onPageLoad?.(page)
        this.dispatchEvent({ type: 'pageload', detail: { page } })
      },
      onUnload: (page) => {
        if (this.loader !== loader) return
        this.view?.engine.setPageTexture(page, this.paper.blank)
      },
      onError: (page, error) => this.fail(error, page),
    })
    this.loader = loader
    this.inView = ''
    this.ready = this.readyFired = false
    // the pages around the start, so the first turn either way has its next page ready
    const count = this.pageCount
    const first = [around - 1, around, around + 1, around + 2]
    const visible = pagesAt(pageToPosition(around, layout, count), layout, count)
    loader.start(visible[0] ?? around, visible[visible.length - 1] ?? around, first).then(() => {
      if (this.loader !== loader || this.disposed) return
      this.ready = true
      this.requestFrame()
    })
  }

  // loads around what's on screen, pages mid-turn included, the page being read first
  private followReader(engine: Engine, layout: Layout) {
    if (!this.loader) return
    const { from, to } = engine.pagesInView()
    const around = pagesAt(engine.position, layout, this.pageCount)[0] ?? to
    const key = `${from}:${to}:${around}`
    if (key === this.inView) return
    this.inView = key
    this.loader.focus(from, to, around)
  }

  private fail(error: unknown, page?: number) {
    if (this.options.onError) this.options.onError(error, page)
    else console.warn('[leafthrough]', error)
    this.dispatchEvent({ type: 'error', detail: { error, page } })
  }

  private detail(): PageChangeDetail {
    return pageDetail(this.view?.engine.position ?? 0, this.layout, this.pageCount)
  }

  private emitPageChange() {
    const detail = this.detail()
    const key = `${detail.layout}:${detail.visiblePages.join(',')}/${detail.pageCount}`
    if (key === this.lastDetailKey) return
    const first = !this.lastDetailKey
    this.lastDetailKey = key
    if (first) return
    this.options.onPageChange?.(detail)
    this.dispatchEvent({ type: 'pagechange', detail })
  }
}

// What a deform compiles to: new uniform values, or new objects under the same names, don't rebuild.
const deformKey = ({ deform }: LeafThroughObjectOptions) =>
  deform ? `${deform.glsl}\n${Object.keys(deform.uniforms ?? {}).join(',')}` : ''

// Like snapshot(), but deform's uniforms stay the caller's own objects, whose values the shaders read.
function copyOptions(options: LeafThroughObjectOptions): LeafThroughObjectOptions {
  const copy = snapshot(options)
  const uniforms = options.deform?.uniforms
  if (copy.deform && uniforms) copy.deform = { ...copy.deform, uniforms: { ...uniforms } }
  return copy
}
