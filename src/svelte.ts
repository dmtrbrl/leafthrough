import { LeafThrough } from './LeafThrough.js'
import type { LeafThroughOptions } from './options.js'

export { LeafThrough }
export type * from './options.js'

export interface LeafThroughActionOptions extends LeafThroughOptions {
  /** Called with the instance, for `next()`, `prev()` and `goTo()`. */
  onInit?: (magazine: LeafThrough) => void
}

/**
 * Svelte action (Svelte 4 and 5). Give the element a size.
 *
 * ```svelte
 * <div style="height: 80vh" use:leafThrough={{ pages, onPageChange: (d) => (page = d.page) }} />
 * ```
 */
export function leafThrough(node: HTMLElement, options: LeafThroughActionOptions) {
  const { onInit, ...rest } = options
  const magazine = new LeafThrough(node, rest)
  onInit?.(magazine)
  return {
    update(next: LeafThroughActionOptions) {
      const { onInit: _ignored, ...nextRest } = next
      magazine.update(nextRest)
    },
    destroy() {
      magazine.dispose()
    },
  }
}
