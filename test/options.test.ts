import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { LeafThrough } from '../src/LeafThrough.js'
import { base, internals, pages, pause, stage, withMagazine } from './helpers.js'

test('equal options keep the scene; setOptions puts left-out options back to defaults', () =>
  withMagazine({}, (m) => {
    const { engine } = internals(m).view
    m.update({ paper: { grain: false } })
    expect(internals(m).view.engine).toBe(engine)
    m.setOptions({ pages: internals(m).options.pages, layout: 'single', paper: { grain: false } })
    expect(internals(m).view.settings.loop).toBe(true)
  }))

test('changes made in place to the options are applied', () =>
  withMagazine({}, (m) => {
    const motion = { speed: 1, jitter: false }
    const sources = pages(2)
    m.setOptions({ ...base, pages: sources, motion })
    motion.speed = 2
    sources.push(...pages(1))
    m.setOptions({ ...base, pages: sources, motion })
    expect(internals(m).view.settings.motion.speed).toBe(2)
    m.goTo(2)
    expect(m.page).toBe(2)
  }))

test('replacing the pages loads the new textures and fires ready again', () =>
  withMagazine({}, async (m) => {
    let ready = 0
    m.addEventListener('ready', () => ready++)
    m.setOptions({ ...base, pages: pages(2) })
    await pause()
    internals(m).frame(performance.now())
    expect(m.pageCount).toBe(2)
    expect(ready).toBe(1)
    expect(internals(m).loader.textures.filter(Boolean)).toHaveLength(2)
  }))

test('replacing one page texture keeps the engine, the other textures and the ready state', () =>
  withMagazine({ pages: pages(3), preload: Infinity }, async (m) => {
    let ready = 0
    m.addEventListener('ready', () => ready++)
    const before = internals(m)
    const engine = before.view.engine
    const kept = [...before.loader.textures]
    const replacement = new THREE.Texture()
    m.update({ pages: [before.options.pages[0], replacement, before.options.pages[2]] })
    expect(internals(m).view.engine).toBe(engine)
    expect(internals(m).loader).toBe(before.loader)
    expect(internals(m).loader.textures).toEqual([kept[0], replacement, kept[2]])
    expect(m.element.dataset.state).toBe('ready')
    await pause()
    internals(m).frame(performance.now())
    expect(ready).toBe(0)
    replacement.dispose()
  }))

test.each(['single', 'spread'] as const)('%s sheets are laid out before the first frame after a rebuild', (layout) =>
  withMagazine({ layout, pages: pages(10), paper: { grain: false, depthBias: true } }, (m) => {
    m.update({ layout: layout === 'single' ? 'spread' : 'single' })
    const layering = () =>
      (internals(m).view.engine as unknown as { sheets: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> }[] }).sheets.map(
        ({ mesh }) => [mesh.visible, mesh.renderOrder, mesh.material.polygonOffset, mesh.material.polygonOffsetUnits],
      )
    const rebuilt = layering()
    expect(rebuilt.some(([, renderOrder]) => (renderOrder as number) > 0)).toBe(true)
    internals(m).frame(performance.now())
    expect(rebuilt).toEqual(layering())
  }))

test.each([
  ['a number', 0xff0000],
  ['a string', '#ff0000'],
  ['a Color', new THREE.Color(0xff0000)],
])('paper.backColor as %s colours the blank page backs', (_, backColor) =>
  withMagazine({ paper: { grain: false, backColor } }, (m) => {
    expect(Array.from(internals(m).paper.backBlank.texture.image.data as Uint8Array)).toEqual([255, 0, 0, 255])
  }))

test('20 rebuilds keep the GPU geometry and texture counts steady', () =>
  withMagazine({}, (m) => {
    const { renderer } = internals(m)
    internals(m).frame(performance.now())
    const before = { ...renderer.info.memory }
    for (let i = 0; i < 20; i++) {
      m.update({ motion: { speed: 1 + i / 10 } })
      internals(m).frame(performance.now())
    }
    expect({ ...renderer.info.memory }).toEqual(before)
  }))

test('the default grain and shadow shaders compile in both layouts', async () => {
  const errors = vi.spyOn(console, 'error')
  try {
    for (const layout of ['single', 'spread'] as const) {
      await withMagazine({ layout, paper: { grain: true }, lighting: { shadows: true } }, (m) => {
        m.next()
        internals(m).frame(performance.now() + 250)
        const { renderer } = internals(m)
        expect(renderer.info.render.calls).toBeGreaterThan(0)
        const programs = renderer.info.programs as unknown as { diagnostics?: { runnable: boolean } }[]
        expect(programs.filter((p) => p.diagnostics?.runnable === false)).toEqual([])
      })
    }
    expect(errors).not.toHaveBeenCalled()
  } finally {
    errors.mockRestore()
  }
})

test('a custom grain that fails after dispose reports nothing', async () => {
  const OriginalImage = window.Image
  let image: { onerror?: () => void } | undefined
  window.Image = class {
    onerror?: () => void
    constructor() {
      image = this
    }
    set src(_: string) {}
  } as unknown as typeof Image
  const onError = vi.fn()
  try {
    const m = new LeafThrough(stage, { ...base, pages: pages(2), paper: { grain: 'pending-grain.png' }, onError })
    m.dispose()
    image!.onerror!()
    await pause(0)
    expect(onError).not.toHaveBeenCalled()
  } finally {
    window.Image = OriginalImage
  }
})

