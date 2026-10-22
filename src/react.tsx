'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react'
import { FoldableMagazine as Magazine, type GoToOptions } from './FoldableMagazine.js'
import { defaultPageLabel, type FoldableOptions, type PageChangeDetail } from './options.js'

export type * from './options.js'

export interface FoldableMagazineProps extends FoldableOptions {
  className?: string
  style?: CSSProperties
}

export interface FoldableMagazineHandle {
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
 * const ref = useRef<FoldableMagazineHandle>(null)
 * <FoldableMagazine ref={ref} pages={pages} style={{ height: '80vh' }} onPageChange={(d) => setPage(d.page)} />
 * ```
 */
export const FoldableMagazine = forwardRef<FoldableMagazineHandle, FoldableMagazineProps>(function FoldableMagazine(
  { className, style, ...options },
  ref,
) {
  const element = useRef<HTMLDivElement>(null)
  const instance = useRef<Magazine | null>(null)
  // callbacks change every render; route them through a ref so they never cause a rebuild
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const magazine = new Magazine(element.current!, {
      ...latest.current,
      onPageChange: (detail: PageChangeDetail) => latest.current.onPageChange?.(detail),
      onReady: () => latest.current.onReady?.(),
      onError: (error: unknown, page?: number) => {
        const handler = latest.current.onError
        if (handler) handler(error, page)
        else console.warn('[foldable-magazine]', error)
      },
      formatPageLabel: (detail: PageChangeDetail) =>
        latest.current.formatPageLabel?.(detail) ?? defaultPageLabel(detail),
    })
    instance.current = magazine
    return () => {
      magazine.dispose()
      instance.current = null
    }
  }, [])

  // everything else is compared by value inside update(), so inline objects are fine
  const { onPageChange: _a, onReady: _b, onError: _c, formatPageLabel: _d, ...data } = options
  useEffect(() => {
    instance.current?.update(data)
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

