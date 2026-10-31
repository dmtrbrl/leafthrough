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

// Stands in for requestIdleCallback: records the callbacks, and lets the test run them with
// as much idle time as it likes, 10 ms less each time it's asked.
class FakeIdle {
  static callbacks: IdleRequestCallback[] = []
  static cancelled = 0
  static install() {
    window.requestIdleCallback = (callback) => FakeIdle.callbacks.push(callback)
    window.cancelIdleCallback = () => FakeIdle.cancelled++
  }
  static run(remaining = 0) {
    const callbacks = FakeIdle.callbacks
    FakeIdle.callbacks = []
    for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => (remaining -= 10) + 10 })
  }
}
const originalIdle = { request: window.requestIdleCallback, cancel: window.cancelIdleCallback }

beforeEach(() => {
  FakeImage.requests = []
  FakeIdle.callbacks = []
  FakeIdle.cancelled = 0
  window.Image = FakeImage as unknown as typeof Image
})

afterEach(() => {
  window.Image = OriginalImage
  window.requestIdleCallback = originalIdle.request
  window.cancelIdleCallback = originalIdle.cancel
})

const loaded = (loader: PageLoader) => loader.textures.flatMap((texture, i) => (texture ? [i] : []))

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

test('a looping magazine keeps the cover close to the last page', () => {
  const loader = new PageLoader(urls(30), renderer, 1, quiet())
  void loader.start(29, 29, [28, 29])
  loader.setWrap(true)
  expect(requested()).toEqual(['page28.png', 'page29.png', 'page0.png'])
  loader.dispose()
})

test('of the pages in view, the one being read loads first', () => {
  const loader = new PageLoader(urls(12), renderer, 0, quiet())
  void loader.start(9, 9, [])
  loader.focus(0, 9, 9)
  expect(requested()).toEqual(['page9.png', 'page8.png', 'page7.png', 'page6.png'])
  loader.dispose()
})

test('pages left far behind are unloaded and freed', async () => {
  window.Image = OriginalImage
  FakeIdle.install()
  const events = quiet()
  const loader = new PageLoader(pages(30), renderer, 2, events)
  await loader.start(0, 1, [0, 1, 2])
  await pause(0)
  // page 3 waits for idle time
  FakeIdle.run()
  const early = loader.textures.slice(0, 4)
  expect(early.every(Boolean)).toBe(true)
  const disposed = vi.fn()
  early.forEach((texture) => texture!.addEventListener('dispose', disposed))

  loader.focus(20, 21)
  expect(loader.textures.slice(0, 4).some(Boolean)).toBe(false)
  expect(events.onUnload).toHaveBeenCalledTimes(4)
  expect(disposed).toHaveBeenCalledTimes(4)
  await pause(0)
  FakeIdle.run(50)
  expect(loaded(loader)).toEqual([18, 19, 20, 21, 22, 23])
  loader.dispose()
})

test('pages beyond the ones near the reader go to the GPU a frame at a time, nearest first', async () => {
  window.Image = OriginalImage
  FakeIdle.install()
  const events = quiet()
  const loader = new PageLoader(pages(12), renderer, Infinity, events)
  await loader.start(0, 0, [0, 1])
  await pause(0)
  // the first pages and the one next to the view at once; the rest wait
  expect(loaded(loader)).toEqual([0, 1])
  expect(events.onLoad).toHaveBeenCalledTimes(2)
  expect(FakeIdle.callbacks).toHaveLength(1)
  FakeIdle.run()
  expect(loaded(loader)).toEqual([0, 1, 2])
  expect(events.onLoad).toHaveBeenLastCalledWith(2, loader.textures[2])
  // with idle time to spare, more go
  FakeIdle.run(20)
  expect(loaded(loader)).toEqual([0, 1, 2, 3, 4, 5])
  // the reader jumping ahead gets the pages there at once, and the queue follows
  loader.focus(10, 10)
  expect(loaded(loader)).toEqual([0, 1, 2, 3, 4, 5, 9, 10, 11])
  FakeIdle.run()
  expect(loaded(loader)).toEqual([0, 1, 2, 3, 4, 5, 8, 9, 10, 11])
  FakeIdle.run(50)
  expect(loaded(loader)).toHaveLength(12)
  expect(FakeIdle.callbacks).toHaveLength(0)
  loader.dispose()
})

test('waiting pages left far behind are dropped, and dispose() cancels the rest', async () => {
  window.Image = OriginalImage
  FakeIdle.install()
  const events = quiet()
  const loader = new PageLoader(pages(30), renderer, 3, events)
  await loader.start(0, 0, [0])
  await pause(0)
  expect(loaded(loader)).toEqual([0, 1])
  loader.focus(20)
  await pause(0)
  expect(loaded(loader)).toEqual([19, 20, 21])
  FakeIdle.run(50)
  expect(loaded(loader)).toEqual([17, 18, 19, 20, 21, 22, 23])
  // 2 and 3 were decoded but never shown; nothing is reported for them
  expect(vi.mocked(events.onUnload).mock.calls.map(([page]) => page)).toEqual([0, 1])
  expect(events.onLoad).not.toHaveBeenCalledWith(2, expect.anything())
  expect(events.onLoad).not.toHaveBeenCalledWith(3, expect.anything())

  loader.focus(0)
  await pause(0)
  expect(FakeIdle.callbacks).toHaveLength(1)
  loader.dispose()
  expect(FakeIdle.cancelled).toBe(1)
  FakeIdle.run(50)
  expect(events.onLoad).not.toHaveBeenCalledWith(2, expect.anything())
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

test('a texture passed in as a page is taken as it is, and not uploaded again', async () => {
  const texture = new THREE.CanvasTexture(pages(1)[0])
  texture.anisotropy = 4
  const version = texture.version
  const initTexture = vi.fn()
  const loader = new PageLoader([texture, pages(1)[0]], { ...renderer, initTexture } as unknown as THREE.WebGLRenderer, Infinity, quiet())
  await loader.start(0, 1, [0, 1])
  expect(texture.version).toBe(version)
  expect(texture.colorSpace).toBe(THREE.NoColorSpace)
  expect(texture.premultiplyAlpha).toBe(false)
  expect(texture.anisotropy).toBe(4)
  // still warmed up, which is nothing when it's on the GPU already
  expect(initTexture).toHaveBeenCalledWith(texture)
  // a page the loader made itself is set up for the paper shader
  const own = loader.textures[1]!
  expect(own.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(own.premultiplyAlpha).toBe(true)
  expect(own.anisotropy).toBe(1)
  expect(initTexture).toHaveBeenCalledWith(own)
  loader.dispose()
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
  await withMagazine({ layout: 'spread', pages: pages(40), preload: 2 }, async (m) => {
    const loaded = () => internals(m).loader.textures.flatMap((texture, i) => (texture ? [i] : []))
    expect(loaded()).toEqual([0, 1, 2])
    m.goTo(30)
    internals(m).frame(performance.now())
    await pause()
    // pages 29 and 30 show, and two either side
    expect(loaded()).toEqual([27, 28, 29, 30, 31, 32])
  })
})
