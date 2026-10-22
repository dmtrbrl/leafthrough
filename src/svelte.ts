import { FoldableMagazine } from './FoldableMagazine.js'
import type { FoldableOptions } from './options.js'

export { FoldableMagazine }
export type * from './options.js'

export interface FoldableActionOptions extends FoldableOptions {
  /** Called with the instance, for `next()`, `prev()` and `goTo()`. */
  onInit?: (magazine: FoldableMagazine) => void
}

/**
 * Svelte action (Svelte 4 and 5). Give the element a size.
 *
 * ```svelte
 * <div style="height: 80vh" use:foldable={{ pages, onPageChange: (d) => (page = d.page) }} />
 * ```
 */
export function foldable(node: HTMLElement, options: FoldableActionOptions) {
  const { onInit, ...rest } = options
  const magazine = new FoldableMagazine(node, rest)
  onInit?.(magazine)
  return {
    update(next: FoldableActionOptions) {
      const { onInit: _ignored, ...nextRest } = next
      magazine.update(nextRest)
    },
    destroy() {
      magazine.dispose()
    },
  }
}
