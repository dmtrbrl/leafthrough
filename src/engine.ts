import type * as THREE from 'three'
import type { ResolvedSettings } from './options.js'
import type { SheetShading } from './paper/paperMaterial.js'

export interface EngineContext {
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  /** Receives pointer input; covers the pages. */
  hitArea: HTMLElement
  settings: ResolvedSettings
  /** One texture per page, in reading order. */
  textures: THREE.Texture[]
  /** Plain paper, for missing or unprinted sides. */
  blank: THREE.Texture
  pattern: THREE.Texture
  /** Where the magazine opens, in the engine's own position units. */
  position: number
  /** Kept current by the controller as the magazine resizes. */
  metrics: EngineMetrics
  /** Shared by every sheet; the engine keeps spineContact current. */
  shading: SheetShading
}

export interface EngineMetrics {
  /** Pixels a drag spans per unit of `dragDistance`. */
  dragWidth: number
}

export interface Engine {
  readonly group: THREE.Group
  /** Spread: sheets turned to the left. Single: pages turned. */
  readonly position: number
  readonly maxPosition: number
  /** Which part of the pages takes input: a closed spread only turns from its cover side. */
  readonly activeSide: 'both' | 'right' | 'left'
  /** Advances the simulation; returns true when the frame needs drawing. */
  update(now: number): boolean
  /** Turns the top page one way; false when there's nothing to turn. */
  flip(forward: boolean): boolean
  /** Moves to a position at once, without animating. */
  jumpTo(position: number): void
  setPageTexture(page: number, texture: THREE.Texture): void
  dispose(): void
}
