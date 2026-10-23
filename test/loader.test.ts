import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { PageLoader } from '../src/textures.js'
import { internals, pause, withMagazine } from './helpers.js'

// enough of a renderer for the loader
const renderer = { capabilities: { getMaxAnisotropy: () => 1 }, initTexture: () => {} } as unknown as THREE.WebGLRenderer

test('the loader keeps at most four requests in flight', async () => {
  const OriginalImage = window.Image
  let started = 0
  window.Image = class {
    set src(_: string) {
      started++
    }
  } as unknown as typeof Image
  const loader = new PageLoader(
    Array.from({ length: 12 }, (_, i) => `page${i}.png`),
    renderer,
    () => {},
    () => {},
  )
  try {
    void loader.start(5, [4, 5, 6, 7])
    expect(started).toBe(4)
  } finally {
    loader.dispose()
    window.Image = OriginalImage
    await pause(0)
  }
})

test("a texture passed in as a page isn't disposed with the loader", async () => {
  const texture = new THREE.Texture()
  const disposed = vi.fn()
  texture.addEventListener('dispose', disposed)
  const loader = new PageLoader([texture], renderer, () => {}, () => {})
  await loader.start(0, [0])
  loader.dispose()
  expect(disposed).not.toHaveBeenCalled()
  texture.dispose()
})

test('a page that fails to load is reported and the magazine still gets ready', async () => {
  const onError = vi.fn()
  await withMagazine({ pages: ['data:image/png;base64,INVALID'], onError }, async (m) => {
    await pause(100)
    internals(m).frame(performance.now())
    expect(m.element.dataset.state).toBe('ready')
    expect(internals(m).loader.textures.filter(Boolean)).toHaveLength(0)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 0)
  })
})
