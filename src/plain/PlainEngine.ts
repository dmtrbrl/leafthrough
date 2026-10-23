import * as THREE from 'three'
import type { Engine } from '../engine.js'
import type { ResolvedSettings } from '../options.js'

// a horizontal swipe longer than this turns the page; anything shorter is a click
const SWIPE_PX = 30

export interface PlainEngineContext {
  /** Receives pointer input; covers the pages. */
  hitArea: HTMLElement
  settings: ResolvedSettings
  pageCount: number
  /** Where the magazine opens, in the engine's own position units. */
  position: number
}

/**
 * The plain view's engine: nothing moves, the pages just change. Positions mean what they
 * do in the 3D engines (spread: sheets turned to the left; single: pages turned). The
 * controller shows the pages themselves.
 */
export class PlainEngine implements Engine {
  readonly group = new THREE.Group()
  readonly maxPosition: number
  private readonly spread: boolean
  private readonly settings: ResolvedSettings
  private readonly hitArea: HTMLElement
  private readonly abort = new AbortController()
  private current: number
  private dirty = true
  // the pointer that started the gesture; other pointers are ignored until it lifts
  private press: { id: number; x: number; y: number } | null = null

  constructor(ctx: PlainEngineContext) {
    this.settings = ctx.settings
    this.hitArea = ctx.hitArea
    this.spread = ctx.settings.layout === 'spread'
    this.maxPosition = this.spread ? Math.ceil(ctx.pageCount / 2) : ctx.pageCount
    this.current = this.clamp(ctx.position)
    this.bindInput()
  }

  get position() {
    return this.current
  }

  // closed, only the cover side can be clicked
  get activeSide() {
    if (!this.spread) return 'both'
    if (this.current === 0) return 'right'
    if (this.current === this.maxPosition) return 'left'
    return 'both'
  }

  update() {
    const moved = this.dirty
    this.dirty = false
    return moved
  }

  flip(forward: boolean) {
    if (!forward) {
      if (this.current <= 0) return false
      this.current--
    } else if (this.spread) {
      if (this.current >= this.maxPosition) return false
      this.current++
    } else if (this.current < this.maxPosition - 1) {
      this.current++
    } else if (this.settings.loop && this.current > 0) {
      // the last page turns back to the cover
      this.current = 0
    } else return false
    this.dirty = true
    return true
  }

  jumpTo(position: number) {
    this.current = this.clamp(position)
    this.dirty = true
  }

  setPageTexture() {}

  dispose() {
    this.abort.abort()
  }

  private clamp(position: number) {
    const last = this.spread ? this.maxPosition : this.maxPosition - 1
    return Math.min(Math.max(Math.round(position), 0), Math.max(last, 0))
  }

  // a click on the left half goes back, on the right half forward; a swipe goes its way
  private bindInput() {
    const el = this.hitArea
    const signal = this.abort.signal
    const { interaction } = this.settings
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (this.press && !e.isPrimary) return
        if (e.button !== 0 || !(interaction.drag || interaction.click)) return
        this.press = { id: e.pointerId, x: e.clientX, y: e.clientY }
      },
      { signal },
    )
    el.addEventListener(
      'pointerup',
      (e) => {
        const press = this.press
        if (!press || e.pointerId !== press.id) return
        this.press = null
        const dx = e.clientX - press.x
        if (Math.abs(dx) > SWIPE_PX) {
          if (interaction.drag) this.flip(dx < 0)
          return
        }
        if (!interaction.click) return
        const rect = el.getBoundingClientRect()
        // a closed spread's hit area is just its cover, so the side decides
        const side = this.activeSide
        this.flip(side === 'both' ? e.clientX >= rect.left + rect.width / 2 : side === 'right')
      },
      { signal },
    )
    const cancel = (e: PointerEvent) => {
      if (this.press?.id === e.pointerId) this.press = null
    }
    el.addEventListener('pointercancel', cancel, { signal })
  }
}
