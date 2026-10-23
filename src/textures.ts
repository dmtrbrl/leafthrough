import * as THREE from 'three'
import type { PageSource } from './options.js'

/**
 * Loads page images into textures, nearest pages first. Pages show plain paper until
 * their image arrives.
 */
export class PageLoader {
  /** Loaded textures by page; missing pages are still loading (or failed). */
  readonly textures: (THREE.Texture | undefined)[]
  private readonly owned = new Set<THREE.Texture>()
  private readonly abort = new AbortController()
  private disposed = false

  constructor(
    private readonly sources: PageSource[],
    private readonly renderer: THREE.WebGLRenderer,
    private readonly onLoad: (page: number, texture: THREE.Texture) => void,
    private readonly onError: (page: number, error: unknown) => void,
  ) {
    this.textures = new Array(sources.length)
  }

  /** Starts loading, pages closest to `around` first. Resolves once `first` pages are in. */
  start(around: number, first: number[]): Promise<void> {
    const order = this.sources.map((_, i) => i).sort((a, b) => Math.abs(a - around) - Math.abs(b - around))
    const firstReady = Promise.all(first.filter((i) => i >= 0 && i < this.sources.length).map((i) => this.load(i)))
    // a few at a time, so the first pages aren't starved
    let next = 0
    const worker = async () => {
      while (next < order.length && !this.disposed) await this.load(order[next++])
    }
    for (let i = 0; i < 4; i++) void worker()
    return firstReady.then(() => undefined)
  }

  private pending = new Map<number, Promise<void>>()

  private load(page: number): Promise<void> {
    const existing = this.pending.get(page)
    if (existing) return existing
    const job = this.createTexture(this.sources[page])
      .then((texture) => {
        if (this.disposed) {
          if (this.owned.has(texture)) texture.dispose()
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
        this.onLoad(page, texture)
      })
      .catch((error) => {
        if (!this.disposed) this.onError(page, error)
      })
    this.pending.set(page, job)
    return job
  }

  private async createTexture(source: PageSource): Promise<THREE.Texture> {
    if (source instanceof THREE.Texture) return source
    const own = <T extends THREE.Texture>(texture: T) => (this.owned.add(texture), texture)
    if (typeof source === 'string') return own(new THREE.Texture(await loadImage(source, this.abort.signal)))
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

  dispose() {
    this.disposed = true
    this.abort.abort()
    for (const texture of this.owned) texture.dispose()
    this.owned.clear()
  }
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const fail = (error: unknown) => {
      img.onload = img.onerror = null
      reject(error)
    }
    signal.addEventListener('abort', () => fail(new DOMException('Magazine disposed', 'AbortError')), { once: true })
    img.onload = () => {
      img.onload = img.onerror = null
      img.decode().then(() => resolve(img), () => resolve(img))
    }
    img.onerror = () => fail(new Error(`Failed to load page image: ${url}`))
    img.src = url
  })
}

/** Loads the paper grain option into a tiling texture. */
export async function loadGrain(source: string | HTMLImageElement | HTMLCanvasElement): Promise<THREE.Texture> {
  let texture: THREE.Texture
  if (typeof source === 'string') texture = new THREE.Texture(await loadImage(source, new AbortController().signal))
  else if (source instanceof HTMLCanvasElement) texture = new THREE.CanvasTexture(source)
  else {
    if (!source.complete || !source.naturalWidth) await source.decode()
    texture = new THREE.Texture(source)
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}
