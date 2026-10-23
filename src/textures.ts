import * as THREE from 'three'
import type { PageImage } from './options.js'

// requests in flight at once, so the pages nearest the reader aren't starved
const CONCURRENCY = 4

export interface PageLoaderEvents {
  onLoad(page: number, texture: THREE.Texture): void
  /** The page's texture was freed; show plain paper until it loads again. */
  onUnload(page: number): void
  onError(page: number, error: unknown): void
}

/**
 * Loads page images into textures, nearest the visible pages first. Pages within `radius`
 * of the visible ones load; pages more than twice as far unload. Pages show plain paper
 * until their image arrives.
 */
export class PageLoader {
  /** Loaded textures by page; missing pages are still loading, unloaded or failed. */
  readonly textures: (THREE.Texture | undefined)[]
  private readonly owned = new Set<THREE.Texture>()
  private readonly inFlight = new Map<number, AbortController>()
  private readonly failed = new Set<number>()
  // `first` pages load before the rest; the rest go nearest first
  private first: number[] = []
  // the visible pages
  private from = 0
  private to = 0
  private waiting = new Set<number>()
  private settleFirst: () => void = () => {}
  private disposed = false

  constructor(
    private readonly sources: PageImage[],
    private readonly renderer: THREE.WebGLRenderer,
    private radius: number,
    private readonly events: PageLoaderEvents,
  ) {
    this.textures = new Array(sources.length)
  }

  /**
   * Starts loading around the visible pages `from`–`to`. Resolves once the `first` pages
   * within reach are in (or failed).
   */
  start(from: number, to: number, first: number[]): Promise<void> {
    this.from = from
    this.to = to
    this.first = first.filter((i) => i >= 0 && i < this.sources.length && this.distance(i) <= this.radius)
    this.waiting = new Set(this.first)
    const ready = new Promise<void>((resolve) => (this.settleFirst = resolve))
    this.focus(from, to)
    if (!this.waiting.size) this.settleFirst()
    return ready
  }

  /** Follows the reader: loads around the visible pages and unloads pages left far behind. */
  focus(from: number, to = from) {
    if (this.disposed) return
    this.from = from
    this.to = to
    const keep = 2 * this.radius
    for (const [i, request] of this.inFlight) {
      if (this.distance(i) <= keep) continue
      request.abort()
      // frees its slot now, for the pages that are wanted
      this.inFlight.delete(i)
    }
    this.textures.forEach((texture, i) => {
      if (!texture || this.distance(i) <= keep || !this.owned.has(texture)) return
      this.textures[i] = undefined
      this.events.onUnload(i)
      this.owned.delete(texture)
      texture.dispose()
    })
    this.pump()
  }

  setRadius(radius: number) {
    this.radius = radius
    this.focus(this.from, this.to)
  }

  /** Loads the pages that failed again. */
  retry() {
    this.failed.clear()
    this.pump()
  }

  dispose() {
    this.disposed = true
    for (const request of this.inFlight.values()) request.abort()
    for (const texture of this.owned) texture.dispose()
    this.owned.clear()
  }

  // pages away from the visible ones
  private distance(page: number) {
    return page < this.from ? this.from - page : page > this.to ? page - this.to : 0
  }

  // starts the most wanted pages while there's room
  private pump() {
    if (this.disposed || this.inFlight.size >= CONCURRENCY) return
    const wanted = (i: number) =>
      !this.textures[i] && !this.inFlight.has(i) && !this.failed.has(i) && this.distance(i) <= this.radius
    const queue = [
      ...this.first.filter((i) => this.waiting.has(i)),
      ...this.sources.map((_, i) => i).sort((a, b) => this.distance(a) - this.distance(b)),
    ]
    for (const page of queue) {
      if (this.inFlight.size >= CONCURRENCY) return
      if (wanted(page)) this.load(page)
    }
  }

  private load(page: number) {
    const request = new AbortController()
    this.inFlight.set(page, request)
    this.createTexture(this.sources[page], request.signal)
      .then((texture) => {
        if (this.disposed || request.signal.aborted) {
          if (this.owned.delete(texture)) texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        // premultiplied, so filtering at the edge of transparent artwork doesn't pull in the
        // colour of texels nobody sees (the shader lays the page over the paper colour)
        texture.premultiplyAlpha = true
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        texture.needsUpdate = true
        this.renderer.initTexture(texture)
        this.textures[page] = texture
        this.events.onLoad(page, texture)
      })
      .catch((error) => {
        if (this.disposed || request.signal.aborted) return
        this.failed.add(page)
        this.events.onError(page, error)
      })
      .finally(() => {
        if (this.inFlight.get(page) === request) this.inFlight.delete(page)
        // an aborted page counts too: it's no longer needed to call the magazine ready
        if (this.waiting.delete(page) && !this.waiting.size) this.settleFirst()
        this.pump()
      })
  }

  private async createTexture(source: PageImage, signal: AbortSignal): Promise<THREE.Texture> {
    if (source instanceof THREE.Texture) return source
    const own = <T extends THREE.Texture>(texture: T) => (this.owned.add(texture), texture)
    if (typeof source === 'string') return own(new THREE.Texture(await loadImage(source, signal)))
    if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) return own(new THREE.CanvasTexture(source))
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      if (!source.complete || !source.naturalWidth) await source.decode()
      return own(new THREE.Texture(source))
    }
    // ImageBitmaps ignore flipY, so redraw them the right way up
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    canvas.getContext('2d')!.drawImage(source, 0, 0)
    return own(new THREE.CanvasTexture(canvas))
  }
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const onAbort = () => {
      done()
      // stops the download
      img.src = ''
      reject(new DOMException('Page no longer needed', 'AbortError'))
    }
    const done = () => {
      img.onload = img.onerror = null
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    img.onload = () => {
      done()
      img.decode().then(() => resolve(img), () => resolve(img))
    }
    img.onerror = () => {
      done()
      reject(new Error(`Failed to load page image: ${url}`))
    }
    img.src = url
  })
}

/** Loads the paper grain option into a tiling texture. */
export async function loadGrain(source: string | HTMLImageElement | HTMLCanvasElement): Promise<THREE.Texture> {
  let texture: THREE.Texture
  if (typeof source === 'string') texture = new THREE.Texture(await loadImage(source))
  else if (source instanceof HTMLCanvasElement) texture = new THREE.CanvasTexture(source)
  else {
    if (!source.complete || !source.naturalWidth) await source.decode()
    texture = new THREE.Texture(source)
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}
