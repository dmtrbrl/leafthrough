import type { Layout } from './options.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** What the camera looks at, in world units (a page is 1 wide, the spine is at x = 0). */
export interface Framing {
  /** Fits the element when bleeding: the pages, plus any room the layout always needs. Takes input. */
  box: Rect
  /** Everything a turning page can reach. The canvas covers this (clipped to the document). */
  view: Rect
  /** Camera position over the floor; the view needn't be centred on it. */
  eye: { x: number; y: number }
  distance: number
  /** World width that a drag of `dragDistance` × this turns a page all the way over. */
  dragWidth: number
  /** Directional shadow frustum, already scaled to the page aspect. */
  shadow: { left: number; right: number; top: number; bottom: number }
}

const REFERENCE_ASPECT = 1.377
// the open spread's canvas reaches this far past the pages on every side
const SPREAD_OVERSCAN = 0.27975

export function framingFor(layout: Layout, aspect: number): Framing {
  const k = aspect / REFERENCE_ASPECT
  if (layout === 'spread') {
    const box = { x: -1, y: -aspect / 2, width: 2, height: aspect }
    const view = {
      x: box.x - SPREAD_OVERSCAN * box.width,
      y: box.y - SPREAD_OVERSCAN * box.height,
      width: box.width * (1 + 2 * SPREAD_OVERSCAN),
      height: box.height * (1 + 2 * SPREAD_OVERSCAN),
    }
    const distance = view.height / 2 / Math.tan((20 * Math.PI) / 180) // 40° fov
    return {
      box,
      view,
      eye: { x: 0, y: 0 },
      distance,
      dragWidth: view.width,
      shadow: { left: -0.8, right: 1, top: 0.85 * k, bottom: -1.05 * k },
    }
  }

  // One page, with a strip left of the spine for turning back and room above and below.
  // Mid-turn a page rolls round the spine as far as x ≈ -1.06 (measured with the fold
  // fully tilted), so the view reaches past that.
  const box = { x: -0.34, y: -1.2 * k, width: 1.56, height: 2.4 * k }
  const view = { x: -1.15, y: box.y, width: box.x + box.width + 1.15, height: box.height }
  return {
    box,
    view,
    eye: { x: box.x + box.width / 2, y: 0 },
    distance: 3.1 * k,
    dragWidth: box.width,
    shadow: { left: -1.1, right: 1.1, top: 0.8 * k, bottom: -0.8 * k },
  }
}

/** The plain view: just the pages, centred, with nothing around them. */
export function plainFramingFor(layout: Layout, aspect: number): Framing {
  const box = layout === 'spread' ? { x: -1, y: -aspect / 2, width: 2, height: aspect } : { x: 0, y: -aspect / 2, width: 1, height: aspect }
  return {
    box,
    view: box,
    eye: { x: box.x + box.width / 2, y: 0 },
    distance: 1,
    dragWidth: box.width,
    shadow: { left: 0, right: 0, top: 0, bottom: 0 },
  }
}

export interface Fit {
  /** Pixels per world unit. */
  scale: number
  /** Where the whole view lands, in px relative to the root's top-left corner. */
  view: Rect
  /** Where the box lands, in px relative to the root. */
  box: Rect
  /** Height the root needs when its container has no height of its own. */
  height: number
}

/**
 * Fits the framing into an element. With `bleed`, the box fills the element and the rest
 * of the view spills past it; without, the whole view stays inside. An element with no
 * height (`height` 0) takes its height from its width.
 */
export function fit(framing: Framing, width: number, height: number, bleed: boolean): Fit {
  const fitted = bleed ? framing.box : framing.view
  const scale = height > 0 ? Math.min(width / fitted.width, height / fitted.height) : width / fitted.width
  const boxHeight = height > 0 ? height : fitted.height * scale

  // centre the fitted rect, then place everything else around it (world y points up)
  const left = (width - fitted.width * scale) / 2 - fitted.x * scale
  const top = (boxHeight - fitted.height * scale) / 2 + (fitted.y + fitted.height) * scale
  const toPx = (r: Rect): Rect => ({
    x: left + r.x * scale,
    y: top - (r.y + r.height) * scale,
    width: r.width * scale,
    height: r.height * scale,
  })
  return { scale, view: toPx(framing.view), box: toPx(framing.box), height: boxHeight }
}
