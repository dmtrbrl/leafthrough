import type { ColorRepresentation, Texture } from 'three'

/** Anything a page can be printed from. Strings are image URLs. */
export type PageSource = string | HTMLImageElement | HTMLCanvasElement | ImageBitmap | Texture

/**
 * `spread`: an open magazine, two pages side by side, sheets turning over the spine.
 * `single`: one page at a time, read pages rolling up behind the magazine.
 */
export type Layout = 'spread' | 'single'

export interface PaperOptions {
  /**
   * Paper fibre texture. `true` uses the built-in one, `false` turns it off, or pass a
   * tiling greyscale image (or its URL). Only the brightest specks show. Default `true`.
   */
  grain?: boolean | string | HTMLImageElement | HTMLCanvasElement
  /** How many times the grain tiles across a page. Default `1.46`. */
  grainScale?: number
  /** How much the grain darkens the paper, 0–1. Default `0.17`. */
  grainStrength?: number
  /** How much of the other side's print shows through, 0–1. Default `0.04` (spread), `0.3` (single). */
  showThrough?: number
  /** How much glossier ink is than bare paper, 0–1. Default `0.33`. */
  inkGloss?: number
  /** Default `0.5`. */
  roughness?: number
  /** A touch of metalness gives the paper its sheen. Default `0.17`. */
  metalness?: number
  /**
   * Colour of unprinted paper: the blank back of single-layout pages, and what shows through
   * transparent parts of page images. Default `#fcfcf9`.
   */
  backColor?: ColorRepresentation
  /** Scales the waviness of resting sheets (spread). `0` lays them flat. Default `1`. */
  wrinkles?: number
  /** Scales how much resting pages bulge up off the spine. Default `1`. */
  bulge?: number
}

export interface LightingOptions {
  /** Hemisphere light. Default sky `#ffffff`, ground `#a1aeaf`, intensity `1.5` (spread) or `1.7` (single). */
  ambient?: { sky?: ColorRepresentation; ground?: ColorRepresentation; intensity?: number }
  /** The one directional light. `position` is in page widths, +z towards the viewer. */
  sun?: { color?: ColorRepresentation; intensity?: number; position?: [number, number, number] }
  /** Default `true`. */
  shadows?: boolean
  /** Shadow map resolution. Default `2048`. */
  shadowMapSize?: number
  /** Opacity of the shadow the magazine casts on the surface under it (spread). `0` hides it. Default `0.15`. */
  floorShadow?: number
}

export interface MotionOptions {
  /** Multiplies the speed of every page turn. Default `1`. */
  speed?: number
  /** Share of the canvas width a drag must travel to turn a page all the way. Default `0.8` (spread), `1.2` (single). */
  dragDistance?: number
  /** Share of a turn a released drag must have made to complete it. Default `0.2` (spread), `0.1` (single). */
  commitThreshold?: number
  /** Scales how much a turning sheet bends. Default `1`. */
  curl?: number
  /** Largest tilt of the fold, in degrees, from where the page is held. Default `45` (spread), `35` (single). */
  maxTilt?: number
  /** Small random differences between turns, so no two look the same. Default `true`. */
  jitter?: boolean
  /** How far a hovered sheet lifts, as a share of a turn (spread). `0` disables. Default `0.03`. */
  hoverLift?: number
  /**
   * `'auto'` follows the user's `prefers-reduced-motion`. When reduced, turns are quicker and
   * hovering doesn't lift pages. Default `'auto'`.
   */
  reducedMotion?: 'auto' | boolean
}

export interface InteractionOptions {
  /** Drag pages to turn them. Default `true`. */
  drag?: boolean
  /** Click or tap a page to turn it. Default `true`. */
  click?: boolean
  /** Press and hold to keep turning pages. Default `true`. */
  hold?: boolean
  /** Hovering lifts the top sheet (spread). Default `true`. */
  hover?: boolean
  /**
   * Arrow keys, PageUp/PageDown, Home/End. `true` listens while the magazine has focus,
   * `'global'` listens on the whole window. Default `true`.
   */
  keyboard?: boolean | 'global'
}

export interface PageChangeDetail {
  /** First visible page, 0-based. */
  page: number
  /** Every page currently showing, 0-based. */
  visiblePages: number[]
  pageCount: number
  layout: Layout
}

export interface LeafThroughOptions {
  /** The pages in reading order, front cover first. */
  pages: PageSource[]
  /** Page to open at, 0-based. Default `0`. Later changes are ignored; use `goTo()`. */
  startPage?: number
  /** `'auto'` picks `spread` when `spreadQuery` matches, `single` otherwise. Default `'auto'`. */
  layout?: 'auto' | Layout
  /** Media query for the spread layout. Default `(min-width: 768px) and (orientation: landscape)`. */
  spreadQuery?: string
  /** Page height divided by width. Default `1.377`. */
  pageAspect?: number
  /** Single layout: after the last page, close and start again from the cover. Default `true`. */
  loop?: boolean
  /**
   * `true` fits the magazine to the container and lets turning pages and shadows spill
   * outside it, up to the edges of the document (the container must not clip).
   * `false` keeps everything inside the container, which makes the pages smaller.
   * Default `true`.
   */
  bleed?: boolean
  paper?: PaperOptions
  lighting?: LightingOptions
  motion?: MotionOptions
  interaction?: InteractionOptions
  /** Upper limit for the canvas pixel ratio. Default `2`. */
  maxPixelRatio?: number
  /** Accessible name. Default `'Magazine'`. */
  label?: string
  /** Text announced to screen readers when pages change. */
  formatPageLabel?: (detail: PageChangeDetail) => string

  onPageChange?: (detail: PageChangeDetail) => void
  onReady?: () => void
  onError?: (error: unknown, page?: number) => void
}

export const DEFAULT_SPREAD_QUERY = '(min-width: 768px) and (orientation: landscape)'
export const DEFAULT_PAGE_ASPECT = 1.377

export function defaultPageLabel({ visiblePages, pageCount }: PageChangeDetail): string {
  if (!visiblePages.length) return `Closed, ${pageCount} pages`
  const [first, last] = [visiblePages[0] + 1, visiblePages[visiblePages.length - 1] + 1]
  return first === last ? `Page ${first} of ${pageCount}` : `Pages ${first}–${last} of ${pageCount}`
}

/** Everything an engine needs, with layout defaults filled in. */
export interface ResolvedSettings {
  layout: Layout
  pageAspect: number
  loop: boolean
  bleed: boolean
  paper: Required<Omit<PaperOptions, 'grain'>> & { grain: PaperOptions['grain'] }
  lighting: {
    ambient: { sky: ColorRepresentation; ground: ColorRepresentation; intensity: number }
    sun: { color: ColorRepresentation; intensity: number; position: [number, number, number] }
    shadows: boolean
    shadowMapSize: number
    floorShadow: number
  }
  motion: Required<Omit<MotionOptions, 'reducedMotion'>> & { reduced: boolean }
  interaction: Required<InteractionOptions>
  maxPixelRatio: number
}

export function resolveSettings(options: LeafThroughOptions, layout: Layout, prefersReducedMotion: boolean): ResolvedSettings {
  const spread = layout === 'spread'
  const paper = options.paper ?? {}
  const lighting = options.lighting ?? {}
  const motion = options.motion ?? {}
  const interaction = options.interaction ?? {}
  const reduced = motion.reducedMotion === 'auto' || motion.reducedMotion === undefined ? prefersReducedMotion : motion.reducedMotion

  return {
    layout,
    pageAspect: options.pageAspect ?? DEFAULT_PAGE_ASPECT,
    loop: options.loop ?? true,
    bleed: options.bleed ?? true,
    paper: {
      grain: paper.grain ?? true,
      grainScale: paper.grainScale ?? 1.46,
      grainStrength: paper.grainStrength ?? 0.17,
      showThrough: paper.showThrough ?? (spread ? 0.04 : 0.3),
      inkGloss: paper.inkGloss ?? 0.33,
      roughness: paper.roughness ?? 0.5,
      metalness: paper.metalness ?? 0.17,
      backColor: paper.backColor ?? '#fcfcf9',
      wrinkles: paper.wrinkles ?? 1,
      bulge: paper.bulge ?? 1,
    },
    lighting: {
      ambient: {
        sky: lighting.ambient?.sky ?? '#ffffff',
        ground: lighting.ambient?.ground ?? '#a1aeaf',
        intensity: lighting.ambient?.intensity ?? (spread ? 1.5 : 1.7),
      },
      sun: {
        color: lighting.sun?.color ?? '#ffffff',
        intensity: lighting.sun?.intensity ?? 2,
        position: lighting.sun?.position ?? (spread ? [-3.5, 1.3, 4.1] : [0.689, -1.15, 2.15]),
      },
      shadows: lighting.shadows ?? true,
      shadowMapSize: lighting.shadowMapSize ?? 2048,
      floorShadow: lighting.floorShadow ?? 0.15,
    },
    motion: {
      speed: Math.max(0.05, (motion.speed ?? 1) * (reduced ? 2.5 : 1)),
      dragDistance: motion.dragDistance ?? (spread ? 0.8 : 1.2),
      commitThreshold: motion.commitThreshold ?? (spread ? 0.2 : 0.1),
      curl: motion.curl ?? 1,
      maxTilt: motion.maxTilt ?? (spread ? 45 : 35),
      jitter: motion.jitter ?? true,
      hoverLift: reduced ? 0 : (motion.hoverLift ?? 0.03),
      reduced,
    },
    interaction: {
      drag: interaction.drag ?? true,
      click: interaction.click ?? true,
      hold: (interaction.hold ?? true) && !reduced,
      hover: interaction.hover ?? true,
      keyboard: interaction.keyboard ?? true,
    },
    maxPixelRatio: options.maxPixelRatio ?? 2,
  }
}
