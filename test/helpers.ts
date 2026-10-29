import type * as THREE from 'three'
import { afterEach, beforeEach } from 'vitest'
import type { Engine } from '../src/engine.js'
import { LeafThrough } from '../src/LeafThrough.js'
import type { LeafThroughOptions, ResolvedSettings } from '../src/options.js'
import type { PageLoader } from '../src/textures.js'

/** The private state the tests read, for things the public API can't show. */
export interface Internals {
  view: { engine: Engine; settings: ResolvedSettings }
  options: LeafThroughOptions
  live: HTMLDivElement
  hitArea: HTMLDivElement
  renderer: THREE.WebGLRenderer
  loader: PageLoader
  paper: { backBlank: { texture: THREE.DataTexture } }
  frame(now: number): void
}

export const internals = (magazine: LeafThrough) => magazine as unknown as Internals

/** Options that keep the scene cheap and deterministic. */
export const base = {
  layout: 'single',
  paper: { grain: false },
  lighting: { shadows: false },
  motion: { jitter: false },
  loop: false,
} satisfies Partial<LeafThroughOptions>

export let stage: HTMLDivElement

beforeEach(() => {
  stage = document.createElement('div')
  stage.style.cssText = 'width:700px;height:480px'
  document.body.append(stage)
})

afterEach(() => {
  stage.remove()
})

export const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

/** Solid-colour canvases, which load without the network. */
export function pages(count: number): HTMLCanvasElement[] {
  return Array.from({ length: count }, (_, i) => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 44
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = ['red', 'blue', 'green', 'yellow'][i % 4]
    ctx.fillRect(0, 0, 32, 44)
    return canvas
  })
}

/** Creates a magazine on the stage, waits for its pages, runs `fn`, then disposes it. */
export async function withMagazine<T>(options: Partial<LeafThroughOptions>, fn: (magazine: LeafThrough) => T | Promise<T>) {
  const magazine = new LeafThrough(stage, { ...base, pages: pages(6), ...options })
  try {
    await pause()
    return await fn(magazine)
  } finally {
    magazine.dispose()
  }
}
