import * as THREE from 'three'
import type { Engine } from './engine.js'
import type { InteractionOptions, Layout, PageChangeDetail } from './options.js'

// --- pages ↔ engine positions -------------------------------------------------------

export function pageToPosition(page: number, layout: Layout, count: number) {
  // NaN (say, from a start-page attribute that isn't a number) means the first page
  const p = THREE.MathUtils.clamp(Math.round(page) || 0, 0, Math.max(count - 1, 0))
  return layout === 'spread' ? Math.ceil(p / 2) : p
}

export function positionToPage(position: number, layout: Layout) {
  return layout === 'spread' ? Math.max(0, 2 * position - 1) : position
}

/** The pages showing at an engine position. */
export function pagesAt(position: number, layout: Layout, count: number) {
  const candidates = layout === 'spread' ? [2 * position - 1, 2 * position] : [position]
  return candidates.filter((p) => p >= 0 && p < count)
}

export function pageDetail(position: number, layout: Layout, count: number): PageChangeDetail {
  const visiblePages = pagesAt(position, layout, count)
  const page = visiblePages.length ? visiblePages[0] : Math.max(0, Math.min(positionToPage(position, layout), count - 1))
  return { page, visiblePages, pageCount: count, layout }
}

// --- an animated goTo() ----------------------------------------------------------

/** Turns one page every `interval` ms until the engine reaches `target`. */
export class Riffle {
  private state: { target: number; interval: number; last: number } | null = null

  get active() {
    return this.state !== null
  }

  start(target: number, speed: number) {
    this.state = { target, interval: 140 / speed, last: -Infinity }
  }

  stop() {
    this.state = null
  }

  step(now: number, engine: Engine) {
    const riffle = this.state
    if (!riffle || now - riffle.last < riffle.interval) return
    if (engine.position === riffle.target) {
      this.state = null
      return
    }
    riffle.last = now
    if (!engine.flip(engine.position < riffle.target)) this.state = null
  }
}

// --- keyboard -------------------------------------------------------------------

export interface KeyboardActions {
  next(): unknown
  prev(): unknown
  first(): unknown
  last(): unknown
}

/**
 * Arrow keys, PageUp/PageDown and Home/End. With `true` they work while `element` has focus;
 * with `'global'` anywhere on the page, except in text fields.
 */
export function bindKeyboard(
  element: HTMLElement,
  mode: () => InteractionOptions['keyboard'] | undefined,
  actions: KeyboardActions,
  signal: AbortSignal,
) {
  const handler = (e: KeyboardEvent) => {
    const current = mode()
    if (!current || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if (current === 'global') {
      const target = e.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
    } else if (e.currentTarget !== element) return
    const keys: Record<string, () => unknown> = {
      ArrowRight: actions.next,
      PageDown: actions.next,
      ArrowLeft: actions.prev,
      PageUp: actions.prev,
      Home: actions.first,
      End: actions.last,
    }
    const action = keys[e.key]
    if (!action) return
    e.preventDefault()
    action()
  }
  element.addEventListener('keydown', handler, { signal })
  window.addEventListener(
    'keydown',
    (e) => {
      if (mode() === 'global' && !element.contains(e.target as Node)) handler(e)
    },
    { signal },
  )
}
