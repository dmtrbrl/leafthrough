import { describe, expect, test } from 'vitest'
import type { LeafThrough } from '../src/LeafThrough.js'
import { internals, withMagazine } from './helpers.js'

// Sends pointer events to the hit area, near the right edge of the page (the forward side).
function pointer(m: LeafThrough, pointerType: 'mouse' | 'touch' = 'mouse') {
  const hit = internals(m).hitArea
  const rect = hit.getBoundingClientRect()
  const x = rect.right - 20
  const y = rect.top + rect.height / 2
  return (type: string, { id = 1, dx = 0 } = {}) =>
    hit.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType, isPrimary: id === 1, button: 0, clientX: x + dx, clientY: y, bubbles: true }))
}

describe.each(['single', 'spread'] as const)('%s layout', (layout) => {
  test('a click turns, a long drag turns, a cancelled drag goes back', () =>
    withMagazine({ layout }, (m) => {
      const send = pointer(m)
      send('pointerdown')
      send('pointerup')
      expect(m.page).toBe(1)

      m.goTo(0)
      send('pointerdown')
      send('pointermove', { dx: -1000 })
      send('pointerup', { dx: -1000 })
      expect(m.page).toBe(1)

      m.goTo(0)
      send('pointerdown')
      send('pointermove', { dx: -1000 })
      send('pointercancel', { dx: -1000 })
      expect(m.page).toBe(0)
    }))

  test("another pointer can't finish the gesture", () =>
    withMagazine({ layout }, (m) => {
      const send = pointer(m, 'touch')
      send('pointerdown', { id: 1 })
      send('pointerup', { id: 2 })
      expect(m.page).toBe(0)
      send('pointerup', { id: 1 })
      expect(m.page).toBe(1)
    }))

  test("a second finger doesn't take over the drag", () =>
    withMagazine({ layout }, (m) => {
      const send = pointer(m, 'touch')
      send('pointerdown', { id: 1 })
      send('pointermove', { id: 1, dx: -1000 })
      // a tap with the second finger would otherwise count as a click and turn the page
      send('pointerdown', { id: 2 })
      send('pointerup', { id: 2 })
      send('pointercancel', { id: 1, dx: -1000 })
      expect(m.page).toBe(0)
    }))

  test('losing pointer capture puts the page back', () =>
    withMagazine({ layout }, (m) => {
      const send = pointer(m)
      send('pointerdown')
      send('pointermove', { dx: -1000 })
      send('lostpointercapture', { dx: -1000 })
      send('pointerup', { dx: -1000 })
      expect(m.page).toBe(0)
    }))
})
