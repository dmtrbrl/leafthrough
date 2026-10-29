import * as THREE from 'three'
import type { ResolvedSettings } from '../options.js'
import { loadGrain } from '../textures.js'
import { solidTexture } from './paperMaterial.js'
import { createPaperPattern } from './paperPattern.js'

export interface PaperTextureEvents {
  /** A custom grain image arrived; sheets made before it show none. */
  onGrain(): void
  onError(error: unknown): void
}

/** Plain paper and the grain, kept across rebuilds and made again only when their options change. */
export class PaperTextures {
  /** Plain paper, for missing pages and the spread's unprinted sides. */
  readonly blank = solidTexture('#fcfcf9')
  backBlank: { texture: THREE.DataTexture; color: string }
  private pattern: { texture: THREE.Texture; key: unknown } | null = null
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
    this.pattern?.texture.dispose()
    let texture: THREE.Texture
    if (key === 'builtin') texture = createPaperPattern(renderer)
    else if (key === 'none') texture = solidTexture('#000000')
    else {
      // until the custom grain arrives, use none
      texture = solidTexture('#000000')
      loadGrain(key as string | HTMLImageElement | HTMLCanvasElement).then(
        (loaded) => {
          if (this.pattern?.key !== key || this.disposed) return loaded.dispose()
          this.pattern.texture.dispose()
          this.pattern.texture = loaded
          this.events.onGrain()
        },
        (error) => {
          if (this.pattern?.key === key && !this.disposed) this.events.onError(error)
        },
      )
    }
    this.pattern = { texture, key }
    return texture
  }

  dispose() {
    this.disposed = true
    this.pattern?.texture.dispose()
    this.blank.dispose()
    this.backBlank.texture.dispose()
  }
}

export function colorKey(color: THREE.ColorRepresentation) {
  return new THREE.Color(color).getHexString()
}
