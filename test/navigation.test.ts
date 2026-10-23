import { describe, expect, test } from 'vitest'
import { internals, pages, pause, stage, withMagazine } from './helpers.js'

describe.each(['single', 'spread'] as const)('%s layout', (layout) => {
  test.each([0, 1, 2, 3, 4, 5, 6])('%i pages: navigation, bounds and disposal', (count) =>
    withMagazine({ layout, pages: pages(count) }, (m) => {
      expect(m.pageCount).toBe(count)
      expect(m.prev()).toBe(false)
      for (let i = 0; i < count; i++) {
        m.goTo(i)
        // a spread shows pages in pairs after the cover: 1-2, 3-4, …
        expect(m.page).toBe(layout === 'spread' && i > 0 ? (i % 2 ? i : i - 1) : i)
      }
      m.goTo(-100)
      expect(m.page).toBe(0)
      m.goTo(1000)
      expect(m.page).toBeGreaterThanOrEqual(0)
      expect(m.page).toBeLessThanOrEqual(Math.max(0, count - 1))
      for (let i = 0; i < count + 2; i++) m.next()
      expect(m.next()).toBe(false)
      for (let i = 0; i < count + 2; i++) m.prev()
      expect(m.page).toBe(0)
      expect(m.prev()).toBe(false)

      m.dispose()
      m.dispose()
      expect(m.next()).toBe(false)
      expect(stage.children.length).toBe(0)
    }),
  )
})

test('looping returns to the cover after the last turn', () =>
  withMagazine({ loop: true }, (m) => {
    m.goTo(5)
    expect(m.next()).toBe(true)
    internals(m).frame(performance.now() + 10_000)
    expect(m.page).toBe(0)
  }))

test('an animated goTo reaches its target', () =>
  withMagazine({}, (m) => {
    m.goTo(5, { animate: true })
    const now = performance.now()
    for (let i = 0; i < 10; i++) internals(m).frame(now + i * 500)
    expect(m.page).toBe(5)
  }))

test('goTo(NaN) is ignored', () =>
  withMagazine({}, (m) => {
    m.goTo(2)
    m.goTo(NaN)
    expect(m.page).toBe(2)
  }))

test('a NaN start page opens on the first page', () =>
  withMagazine({ startPage: NaN }, (m) => {
    expect(m.page).toBe(0)
  }))

test('changing layout keeps the visible page', () =>
  withMagazine({}, (m) => {
    m.goTo(3)
    m.update({ layout: 'spread' })
    expect(m.visiblePages).toEqual([3, 4])
    m.update({ layout: 'single' })
    expect(m.page).toBe(3)
  }))

test('changing the page count refreshes the announcement and fires pagechange', () =>
  withMagazine({}, async (m) => {
    const counts: number[] = []
    m.addEventListener('pagechange', (e) => counts.push(e.detail.pageCount))
    internals(m).frame(performance.now())
    m.update({ pages: pages(8) })
    await pause()
    internals(m).frame(performance.now())
    expect(internals(m).live.textContent).toBe('Page 1 of 8')
    expect(counts).toEqual([8])
  }))

test('arrow keys on the focused magazine turn one page', () =>
  withMagazine({}, (m) => {
    m.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(m.page).toBe(1)
  }))

test('arrow keys do nothing with the keyboard turned off', () =>
  withMagazine({ interaction: { keyboard: false } }, (m) => {
    m.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(m.page).toBe(0)
  }))

test('reduced motion turns off hover lift and press and hold', () =>
  withMagazine({ motion: { reducedMotion: true } }, (m) => {
    const { settings } = internals(m).view
    expect(settings.motion.hoverLift).toBe(0)
    expect(settings.interaction.hold).toBe(false)
  }))
