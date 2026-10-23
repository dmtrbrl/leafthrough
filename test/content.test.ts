import { describe, expect, test, vi } from 'vitest'
import { LeafThrough } from '../src/LeafThrough.js'
import type { PageSource } from '../src/options.js'
import { base, internals, pages, pause, stage, withMagazine } from './helpers.js'

const content = (m: LeafThrough) => m.element.querySelector<HTMLElement>('[data-leafthrough-content]')!
const figures = (m: LeafThrough) => Array.from(content(m).querySelectorAll('figure'))
const shownPages = (m: LeafThrough) => figures(m).map((figure) => Number(figure.dataset.page))

function described(count: number): PageSource[] {
  return pages(count).map((src, i) => ({ src, alt: `Picture ${i + 1}`, text: `Story ${i + 1}.\n\nSecond paragraph.` }))
}

// lets a frame run, so the content catches up with the page
const settle = async (m: LeafThrough) => {
  internals(m).frame(performance.now())
  await pause(0)
}

describe('accessible content', () => {
  test("the visible page's alt and text are there for screen readers", () =>
    withMagazine({ pages: described(4) }, async (m) => {
      await settle(m)
      const [figure] = figures(m)
      expect(figure.getAttribute('aria-label')).toBe('Page 1 of 4')
      expect(figure.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Picture 1')
      expect(Array.from(figure.querySelectorAll('p'), (p) => p.textContent)).toEqual(['Story 1.', 'Second paragraph.'])
      // hidden from sight, not from screen readers
      expect(content(m).getAttribute('aria-hidden')).toBeNull()
      expect(content(m).getBoundingClientRect().width).toBeLessThanOrEqual(1)

      m.next()
      await settle(m)
      expect(shownPages(m)).toEqual([1])
    }))

  test('a spread describes both pages', () =>
    withMagazine({ layout: 'spread', pages: described(6), startPage: 1 }, async (m) => {
      await settle(m)
      expect(shownPages(m)).toEqual([1, 2])
    }))

  test('pages without alt or text add nothing', () =>
    withMagazine({ pages: pages(3) }, async (m) => {
      await settle(m)
      expect(figures(m)).toHaveLength(0)
    }))

  test('changing only alt or text updates the content without a rebuild', () =>
    withMagazine({ pages: described(3) }, async (m) => {
      await settle(m)
      const { engine } = internals(m).view
      const sources = internals(m).options.pages.map((page) => ({ ...(page as object), alt: 'New picture' }))
      m.update({ pages: sources as PageSource[] })
      await settle(m)
      expect(internals(m).view.engine).toBe(engine)
      expect(figures(m)[0].querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('New picture')
    }))
})

describe('plain view', () => {
  test('shows the visible page as an image and turns without 3D', () =>
    withMagazine({ plain: true, pages: described(4) }, async (m) => {
      await settle(m)
      expect(m.plain).toBe(true)
      expect(m.element.dataset.plain).toBe('')
      expect(shownPages(m)).toEqual([0])
      const image = figures(m)[0].querySelector('canvas')!
      expect(image.getAttribute('aria-label')).toBe('Picture 1')
      expect(content(m).getBoundingClientRect().height).toBeGreaterThan(100)

      expect(m.next()).toBe(true)
      await settle(m)
      expect(shownPages(m)).toEqual([1])
      m.goTo(3)
      expect(m.next()).toBe(false)
    }))

  test('a spread shows the cover alone on the right, then pairs', () =>
    withMagazine({ plain: true, layout: 'spread', pages: pages(5) }, async (m) => {
      await settle(m)
      const box = content(m).getBoundingClientRect()
      const [cover] = figures(m)
      expect(cover.getBoundingClientRect().left).toBeCloseTo(box.left + box.width / 2, 0)
      m.next()
      await settle(m)
      expect(shownPages(m)).toEqual([1, 2])
      expect(m.visiblePages).toEqual([1, 2])
    }))

  test('gets ready and reports page loads', async () => {
    const onPageLoad = vi.fn()
    await withMagazine({ plain: true, pages: pages(3), onPageLoad }, async (m) => {
      await settle(m)
      await settle(m)
      expect(m.element.dataset.state).toBe('ready')
      expect(onPageLoad).toHaveBeenCalledWith(0)
    })
  })

  test('turning back reuses the page image instead of loading it again', async () => {
    const onPageLoad = vi.fn()
    const urls = pages(3).map((canvas) => canvas.toDataURL())
    await withMagazine({ plain: true, pages: urls, onPageLoad }, async (m) => {
      await settle(m)
      const first = figures(m)[0].querySelector('img')
      m.next()
      await settle(m)
      m.prev()
      await settle(m)
      expect(figures(m)[0].querySelector('img')).toBe(first)
      expect(onPageLoad.mock.calls.filter(([page]) => page === 0)).toHaveLength(1)
    })
  })

  test('two visible pages with the same image both show it', () =>
    withMagazine({ plain: true, layout: 'spread', pages: Array(5).fill(pages(1)[0].toDataURL()), startPage: 1 }, async (m) => {
      await settle(m)
      expect(figures(m).map((figure) => figure.querySelectorAll('img').length)).toEqual([1, 1])
    }))

  test('a click on the right half turns forward, on the left half back', () =>
    withMagazine({ plain: true }, async (m) => {
      const hit = internals(m).hitArea
      const rect = hit.getBoundingClientRect()
      const click = (x: number) => {
        const init = { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: rect.top + 50, bubbles: true }
        hit.dispatchEvent(new PointerEvent('pointerdown', init))
        hit.dispatchEvent(new PointerEvent('pointerup', init))
      }
      click(rect.right - 10)
      expect(m.page).toBe(1)
      click(rect.left + 10)
      expect(m.page).toBe(0)
    }))

  test('switching plain on and off keeps the page', () =>
    withMagazine({}, async (m) => {
      m.goTo(3)
      m.update({ plain: true })
      expect(m.page).toBe(3)
      expect(m.plain).toBe(true)
      m.update({ plain: false })
      expect(m.page).toBe(3)
      expect(m.plain).toBe(false)
      expect(m.element.dataset.plain).toBeUndefined()
    }))

  test('without WebGL the magazine shows plain pages', async () => {
    const original = HTMLCanvasElement.prototype.getContext
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.includes('webgl') ? null : original.call(this, type, ...(rest as []))
    } as typeof original
    let m: LeafThrough | undefined
    try {
      m = new LeafThrough(stage, { ...base, pages: pages(3) })
      expect(m.plain).toBe(true)
      await pause()
      expect(shownPages(m)).toEqual([0])
      m.next()
      expect(m.page).toBe(1)
    } finally {
      HTMLCanvasElement.prototype.getContext = original
      errors.mockRestore()
      m?.dispose()
    }
    expect(stage.children.length).toBe(0)
  })
})
