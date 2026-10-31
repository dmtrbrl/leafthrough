import * as THREE from 'three'
import type { ResolvedSettings } from '../options.js'
import { loadGrain } from '../textures.js'
import { solidTexture } from './paperMaterial.js'
import { sharedResources } from '../shared.js'
import { createPaperPattern } from './paperPattern.js'

export interface PaperTextureEvents {
  /** A custom grain image arrived; sheets made before it show none. */
  onGrain(): void
  onError(error: unknown): void
}

const BUILTIN_PATTERN = 'paper-pattern'

interface Pattern {
  texture: THREE.Texture
  key: unknown
  /** Lets go of the texture: disposes it, or hands a shared one back. */
  release: () => void
}

/** Plain paper and the grain, kept across rebuilds and made again only when their options change. */
export class PaperTextures {
  /** Plain paper, for missing pages and the spread's unprinted sides. */
  readonly blank = solidTexture('#fcfcf9')
  backBlank: { texture: THREE.DataTexture; color: string }
  private pattern: Pattern | null = null
  private disposed = false

  constructor(backColor: THREE.ColorRepresentation, private readonly events: PaperTextureEvents) {
    this.backBlank = { texture: solidTexture(backColor), color: colorKey(backColor) }
  }

  /** The blank backs of single-layout pages, in `paper.backColor`. */
  back(color: THREE.ColorRepresentation): THREE.Texture {
    const key = colorKey(color)
    if (key !== this.backBlank.color) {
      this.backBlank.texture.dispose()
      this.backBlank = { texture: solidTexture(color), color: key }
    }
    return this.backBlank.texture
  }

  grain(settings: ResolvedSettings, renderer: THREE.WebGLRenderer): THREE.Texture {
    const grain = settings.paper.grain
    const key = grain === true || grain === undefined ? 'builtin' : grain === false ? 'none' : grain
    if (this.pattern?.key === key) return this.pattern.texture
    this.pattern?.release()
    if (key === 'builtin') {
      // one texture for every magazine the renderer draws, freed with the last of them
      const shared = sharedResources(renderer)
      const texture = shared.acquire(BUILTIN_PATTERN, () => createPaperPattern(renderer))
      this.pattern = { texture, key, release: () => shared.release(BUILTIN_PATTERN) }
      return texture
    }
    // none, or none until the custom grain arrives
    const pattern: Pattern = { texture: solidTexture('#000000'), key, release: () => pattern.texture.dispose() }
    this.pattern = pattern
    if (key !== 'none') {
      loadGrain(key as string | HTMLImageElement | HTMLCanvasElement).then(
        (loaded) => {
          if (this.pattern !== pattern || this.disposed) return loaded.dispose()
          pattern.texture.dispose()
          pattern.texture = loaded
          this.events.onGrain()
        },
        (error) => {
          if (this.pattern === pattern && !this.disposed) this.events.onError(error)
        },
      )
    }
    return pattern.texture
  }

  dispose() {
    this.disposed = true
    this.pattern?.release()
    this.pattern = null
    this.blank.dispose()
    this.backBlank.texture.dispose()
  }
}

export function colorKey(color: THREE.ColorRepresentation) {
  return new THREE.Color(color).getHexString()
}
