import * as THREE from 'three'
import type { ResolvedSettings } from './options.js'
import type { SheetShading } from './paper/paperMaterial.js'

export interface EngineContext {
  input: EngineInput
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
  /** Asks for a frame: input and timers change the pages between frames. */
  requestFrame: () => void
}

/** Where pointer input comes from, and how a point on screen reaches the magazine. */
export interface EngineInput {
  /** Receives pointer input. */
  element: HTMLElement
  /** Sets `ray` to the world-space ray through a point on screen; false when there's none. */
  ray(clientX: number, clientY: number, ray: THREE.Ray): boolean
  /** Whether a press at this point lands on the magazine. */
  covers(clientX: number, clientY: number): boolean
}

export interface EngineMetrics {
  /** Pixels a drag spans per unit of `dragDistance`. */
  readonly dragWidth: number
  /** Screen displacement along the magazine’s projected x axis; defaults to horizontal. */
  dragDelta?(dx: number, dy: number): number
}

export interface Engine {
  readonly group: THREE.Group
  /** Spread: sheets turned to the left. Single: pages turned. */
  readonly position: number
  readonly maxPosition: number
  /** Whether a page is being dragged or is still completing a turn. */
  readonly turning: boolean
  /** Which part of the pages takes input: a closed spread only turns from its cover side. */
  readonly activeSide: 'both' | 'right' | 'left'
  /**
   * The pages that can be seen right now, as a range: the ones at rest and any mid-turn. A
   * quick riffle leaves pages turning well behind the position, and they mustn't unload.
   */
  pagesInView(): { from: number; to: number }
  /** Advances the simulation; returns true when the frame needs drawing. */
  update(now: number): boolean
  /** Turns the top page one way; false when there's nothing to turn. */
  flip(forward: boolean): boolean
  /** Moves to a position at once, without animating. */
  jumpTo(position: number): void
  setPageTexture(page: number, texture: THREE.Texture): void
  /** Turns the sheets' shadows on or off, both casting and receiving, without a rebuild. */
  setShadows?(on: boolean): void
  /** Releases pointer capture and cancels active gestures and hold timers. */
  cancelInput?(): void
  dispose(): void
}

const floor = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const inverse = new THREE.Matrix4()
const localRay = new THREE.Ray()

/**
 * Where a world-space ray meets the floor of `object` (its z = 0 plane), in the object's own
 * units; null when it misses. However the object is moved, turned or scaled.
 */
export function floorPoint(object: THREE.Object3D, ray: THREE.Ray, target: THREE.Vector3): THREE.Vector3 | null {
  object.updateWorldMatrix(true, false)
  localRay.copy(ray).applyMatrix4(inverse.copy(object.matrixWorld).invert())
  return localRay.intersectPlane(floor, target)
}

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

/** Sets `ray` to the ray from `camera` through a point on screen over `element`, which shows its view. */
export function rayThrough(camera: THREE.Camera, element: Element, clientX: number, clientY: number, ray: THREE.Ray): boolean {
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return false
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  camera.updateWorldMatrix(true, false)
  raycaster.setFromCamera(ndc, camera)
  ray.copy(raycaster.ray)
  return true
}
