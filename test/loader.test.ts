import * as THREE from 'three'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PageLoader, type PageLoaderEvents } from '../src/textures.js'
import { internals, pages, pause, withMagazine } from './helpers.js'

// enough of a renderer for the loader
const renderer = { capabilities: { getMaxAnisotropy: () => 1 }, initTexture: () => {} } as unknown as THREE.WebGLRenderer
const quiet = (): PageLoaderEvents => ({ onLoad: vi.fn(), onUnload: vi.fn(), onError: vi.fn() })
const urls = (count: number) => Array.from({ length: count }, (_, i) => `page${i}.png`)

// Stands in for Image: records each request, and lets the test finish it.
class FakeImage {
  static requests: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  url = ''
  width = 1
  height = 1
  set src(url: string) {
    if (url) {
      this.url = url
      FakeImage.requests.push(this)
    } else this.url = '(aborted)'
  }
  decode() {
    return Promise.resolve()
  }
}
const requested = () => FakeImage.requests.map((image) => image.url)
const OriginalImage = window.Image

beforeEach(() => {
  FakeImage.requests = []
  window.Image = FakeImage as unknown as typeof Image
})

afterEach(() => {
  window.Image = OriginalImage
})

test('the loader keeps at most four requests in flight', async () => {
  const loader = new PageLoader(urls(12), renderer, Infinity, quiet())
  void loader.start(5, 5, [4, 5, 6, 7])
  expect(requested()).toEqual(['page4.png', 'page5.png', 'page6.png', 'page7.png'])
  loader.dispose()
})

test('the queue follows the reader to a new page', async () => {
  const loader = new PageLoader(urls(30), renderer, Infinity, quiet())
  void loader.start(0, 1, [0, 1])
  loader.focus(20, 21)
  FakeImage.requests[0].onload!()
  await pause(0)
  expect(requested()[4]).toBe('page20.png')
  loader.dispose()
})

test('a jump aborts requests for pages no longer needed', () => {
  const loader = new PageLoader(urls(30), renderer, 1, quiet())
  void loader.start(0, 0, [0, 1])
  const early = [...FakeImage.requests]
  expect(early.map((image) => image.url)).toEqual(['page0.png', 'page1.png'])
  loader.focus(20)
  expect(early.map((image) => image.url)).toEqual(['(aborted)', '(aborted)'])
  expect(requested().slice(2)).toEqual(['page20.png', 'page19.png', 'page21.png'])
  loader.dispose()
})

test('pages left far behind are unloaded and freed', async () => {
  window.Image = OriginalImage
  const events = quiet()
  const loader = new PageLoader(pages(30), renderer, 2, events)
  await loader.start(0, 1, [0, 1, 2])
  await pause(0)
  const early = loader.textures.slice(0, 4)
  expect(early.every(Boolean)).toBe(true)
  const disposed = vi.fn()
  early.forEach((texture) => texture!.addEventListener('dispose', disposed))

  loader.focus(20, 21)
  expect(loader.textures.slice(0, 4).some(Boolean)).toBe(false)
  expect(events.onUnload).toHaveBeenCalledTimes(4)
  expect(disposed).toHaveBeenCalledTimes(4)
  await pause(0)
  expect(loader.textures.filter(Boolean)).toHaveLength(6)
  loader.dispose()
})

test('retry() loads failed pages again', async () => {
  const events = quiet()
  const loader = new PageLoader(urls(1), renderer, Infinity, events)
  const ready = loader.start(0, 0, [0])
  FakeImage.requests[0].onerror!()
  await ready
  expect(events.onError).toHaveBeenCalledWith(0, expect.any(Error))
  loader.focus(0)
  expect(FakeImage.requests).toHaveLength(1)
  loader.retry()
  expect(requested()).toEqual(['page0.png', 'page0.png'])
  loader.dispose()
})

test("a texture passed in as a page isn't disposed with the loader", async () => {
  const texture = new THREE.Texture()
  const disposed = vi.fn()
  texture.addEventListener('dispose', disposed)
  const loader = new PageLoader([texture], renderer, Infinity, quiet())
  await loader.start(0, 0, [0])
  loader.dispose()
  expect(disposed).not.toHaveBeenCalled()
  texture.dispose()
})

test('a page that fails to load is reported and the magazine still gets ready', async () => {
  window.Image = OriginalImage
  const onError = vi.fn()
  await withMagazine({ pages: ['data:image/png;base64,INVALID'], onError }, async (m) => {
    await pause(100)
    internals(m).frame(performance.now())
    expect(m.element.dataset.state).toBe('ready')
    expect(internals(m).loader.textures.filter(Boolean)).toHaveLength(0)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 0)
  })
})

test('the magazine reports each page as it loads', async () => {
  window.Image = OriginalImage
  const onPageLoad = vi.fn()
  await withMagazine({ pages: pages(3), onPageLoad }, () => {
    expect(onPageLoad.mock.calls.map(([page]) => page).sort()).toEqual([0, 1, 2])
  })
})

test('preload keeps only the pages near the reader', async () => {
  window.Image = OriginalImage
  await withMagazine({ pages: pages(40), preload: 2 }, async (m) => {
    const loaded = () => internals(m).loader.textures.flatMap((texture, i) => (texture ? [i] : []))
    expect(loaded()).toEqual([0, 1, 2])
    m.goTo(30)
    internals(m).frame(performance.now())
    await pause()
    expect(loaded()).toEqual([28, 29, 30, 31, 32])
  })
})
