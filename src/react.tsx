'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react'
import { LeafThrough as Magazine, type GoToOptions } from './LeafThrough.js'
import { defaultPageLabel, type LeafThroughOptions, type PageChangeDetail } from './options.js'

export type * from './options.js'

export interface LeafThroughProps extends LeafThroughOptions {
  className?: string
  style?: CSSProperties
}

export interface LeafThroughHandle {
  next(): boolean
  prev(): boolean
  goTo(page: number, options?: GoToOptions): void
  readonly page: number
  readonly pageCount: number
  /** The underlying instance, or null before mount. */
  readonly instance: Magazine | null
}

/**
 * React component (React 18+). Give it a size with `className` or `style`; without a height
 * it takes its height from its width.
 *
 * ```tsx
 * const ref = useRef<LeafThroughHandle>(null)
 * <LeafThrough ref={ref} pages={pages} style={{ height: '80vh' }} onPageChange={(d) => setPage(d.page)} />
 * ```
 */
export const LeafThrough = forwardRef<LeafThroughHandle, LeafThroughProps>(function LeafThrough(
  { className, style, ...options },
  ref,
) {
  const element = useRef<HTMLDivElement>(null)
  const instance = useRef<Magazine | null>(null)
  // callbacks change every render; route them through a ref so they never cause a rebuild
  const latest = useRef(options)
  latest.current = options

  const callbacks = useRef({
    onPageChange: (detail: PageChangeDetail) => latest.current.onPageChange?.(detail),
    onReady: () => latest.current.onReady?.(),
    onError: (error: unknown, page?: number) => {
      const handler = latest.current.onError
      if (handler) handler(error, page)
      else console.warn('[leafthrough]', error)
    },
    formatPageLabel: (detail: PageChangeDetail) => latest.current.formatPageLabel?.(detail) ?? defaultPageLabel(detail),
  }).current

  useEffect(() => {
    const magazine = new Magazine(element.current!, { ...latest.current, ...callbacks })
    instance.current = magazine
    return () => {
      magazine.dispose()
      instance.current = null
    }
  }, [])

  // Props are the whole state, so a prop that's removed goes back to its default.
  // Everything is compared by value, so inline objects and arrays don't rebuild anything.
  useEffect(() => {
    instance.current?.setOptions({ ...options, ...callbacks })
  })

  useImperativeHandle(
    ref,
    () => ({
      next: () => instance.current?.next() ?? false,
      prev: () => instance.current?.prev() ?? false,
      goTo: (page, goToOptions) => instance.current?.goTo(page, goToOptions),
      get page() {
        return instance.current?.page ?? options.startPage ?? 0
      },
      get pageCount() {
        return options.pages.length
      },
      get instance() {
        return instance.current
      },
    }),
    [options.pages.length, options.startPage],
  )

  return <div ref={element} className={className} style={style} />
})

