import type { Layout } from './options.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** What the camera looks at, in world units (a page is 1 wide). */
export interface Framing {
  /** The pages at rest. */
  content: Rect
  /** Everything the canvas shows: the pages plus room for lifted pages and shadows. */
  view: Rect
  fov: number
  distance: number
  /** Directional shadow frustum, already scaled to the page aspect. */
  shadow: { left: number; right: number; top: number; bottom: number }
}

const REFERENCE_ASPECT = 1.377
// the open spread's canvas reaches this far past the pages on every side
const SPREAD_OVERSCAN = 0.27975

export function framingFor(layout: Layout, aspect: number): Framing {
  const k = aspect / REFERENCE_ASPECT
  if (layout === 'spread') {
    const content = { x: -1, y: -aspect / 2, width: 2, height: aspect }
    const view = {
      x: content.x - SPREAD_OVERSCAN * content.width,
      y: content.y - SPREAD_OVERSCAN * content.height,
      width: content.width * (1 + 2 * SPREAD_OVERSCAN),
      height: content.height * (1 + 2 * SPREAD_OVERSCAN),
    }
    const fov = 40
    const distance = view.height / 2 / Math.tan(((fov / 2) * Math.PI) / 180)
    return { content, view, fov, distance, shadow: { left: -0.8, right: 1, top: 0.85 * k, bottom: -1.05 * k } }
  }

  // one page, with a strip left of the spine where read pages roll round, and room above
  // and below for them to swing
  const content = { x: 0, y: -aspect / 2, width: 1, height: aspect }
  const view = { x: -0.34, y: -1.2 * k, width: 1.56, height: 2.4 * k }
  const distance = 3.1 * k
  const fov = (2 * Math.atan(view.height / 2 / distance) * 180) / Math.PI
  return { content, view, fov, distance, shadow: { left: -1.1, right: 1.1, top: 0.8 * k, bottom: -0.8 * k } }
}

export interface Fit {
  /** Pixels per world unit. */
  scale: number
  /** Canvas box, in px relative to the root's top-left corner. */
  canvas: Rect
  /** Pages at rest, in px relative to the root. */
  content: Rect
  /** Height the root needs when its container has no height of its own. */
  height: number
}

/**
 * Fits the framing into a box. With `bleed`, the pages fill the box and the canvas spills
 * past it; without, the whole canvas stays inside. A box with no height (`height` 0) takes
 * its height from its width.
 */
export function fit(framing: Framing, width: number, height: number, bleed: boolean): Fit {
  const fitted = bleed ? framing.content : framing.view
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
  return { scale, canvas: toPx(framing.view), content: toPx(framing.content), height: boxHeight }
}
