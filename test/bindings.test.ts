import { createElement, createRef, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import { defineLeafThrough, type LeafThroughElement } from '../src/element.js'
import type { LeafThrough } from '../src/LeafThrough.js'
import { LeafThrough as ReactMagazine, type LeafThroughHandle } from '../src/react.js'
import { leafThrough } from '../src/svelte.js'
import { LeafThrough as VueMagazine } from '../src/vue.js'
import { base, internals, pages, pause, stage } from './helpers.js'

describe('React', () => {
  test('Strict Mode mount, navigation, prop changes and unmount', async () => {
    const root = createRoot(stage)
    const ref = createRef<LeafThroughHandle>()
    const sources = pages(4)
    const render = (speed: number) =>
      root.render(createElement(StrictMode, null, createElement(ReactMagazine, { ...base, pages: sources, motion: { speed }, ref })))
    try {
      render(1)
      // React renders on its own schedule, which a busy browser can delay
      await vi.waitFor(() => expect(ref.current?.instance).toBeTruthy(), 5000)
      expect(stage.querySelectorAll('[data-leafthrough]')).toHaveLength(1)
      ref.current!.next()
      expect(ref.current!.page).toBe(1)
      render(2)
      await vi.waitFor(() => expect(internals(ref.current!.instance!).view.settings.motion.speed).toBe(2), 5000)
      expect(ref.current!.page).toBe(1)
    } finally {
      root.unmount()
    }
    expect(stage.children.length).toBe(0)
  })
})

describe('Vue', () => {
  // mounts the component with props from `props()`, re-rendered when they change
  async function mount(props: () => Record<string, unknown>) {
    let component: { instance: LeafThrough } | undefined
    const setRef = (v: unknown) => (component = v as typeof component)
    const app = createApp({ render: () => h(VueMagazine as never, { ...props(), ref: setRef }) })
    app.mount(stage)
    await pause()
    return { magazine: () => component!.instance, unmount: () => app.unmount() }
  }

  test('a change inside a reactive option is applied', async () => {
    const state = reactive({ motion: { speed: 1, jitter: false } })
    const sources = pages(4)
    const { magazine, unmount } = await mount(() => ({ ...base, pages: sources, motion: state.motion }))
    try {
      state.motion.speed = 2
      await nextTick()
      expect(internals(magazine()).view.settings.motion.speed).toBe(2)
    } finally {
      unmount()
    }
  })

  test('pushing onto reactive pages adds a page', async () => {
    const sources = reactive(pages(2))
    const { magazine, unmount } = await mount(() => ({ ...base, pages: sources }))
    try {
      sources.push(pages(1)[0])
      await nextTick()
      magazine().goTo(2)
      expect(magazine().page).toBe(2)
    } finally {
      unmount()
    }
  })
})

describe('Svelte', () => {
  test('the action updates and destroys', async () => {
    let magazine: LeafThrough | undefined
    const sources = pages(4)
    const action = leafThrough(stage, { ...base, pages: sources, onInit: (m) => (magazine = m) })
    try {
      await pause()
      magazine!.next()
      expect(magazine!.page).toBe(1)
      action.update({ ...base, pages: sources, motion: { speed: 2 } })
      expect(internals(magazine!).view.settings.motion.speed).toBe(2)
      expect(magazine!.page).toBe(1)
    } finally {
      action.destroy()
    }
    expect(stage.children.length).toBe(0)
  })
})

describe('Web Component', () => {
  function create(tag = 'leaf-through') {
    const el = document.createElement(tag) as LeafThroughElement
    el.style.height = '400px'
    return el
  }

  test('emptying the pages removes the magazine', async () => {
    const el = create()
    el.pages = pages(3)
    el.options = base
    stage.append(el)
    await pause()
    expect(el.instance?.pageCount).toBe(3)
    el.pages = []
    expect(el.pageCount).toBe(0)
    expect(el.instance).toBeNull()
    el.pages = pages(2)
    expect(el.instance?.pageCount).toBe(2)
  })

  test('the global keyboard turns one page when focus is inside the element', async () => {
    const el = create()
    el.pages = pages(6)
    el.options = { ...base, interaction: { keyboard: 'global' } }
    stage.append(el)
    await pause()
    el.instance!.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true, cancelable: true }))
    expect(el.page).toBe(1)
  })

  test('a pages property set before the element upgrades is used', async () => {
    const el = create('test-leaf-through')
    el.pages = pages(3)
    el.options = base
    stage.append(el)
    defineLeafThrough('test-leaf-through')
    await pause()
    expect(el.instance?.pageCount).toBe(3)
    // the property set early mustn't hide the element's own setter
    el.pages = pages(5)
    expect(el.instance?.pageCount).toBe(5)
  })

  test('a start-page attribute that isn’t a number opens on the first page', async () => {
    const el = create()
    el.setAttribute('start-page', 'abc')
    el.pages = pages(3)
    el.options = base
    stage.append(el)
    await pause()
    expect(el.page).toBe(0)
  })
})
