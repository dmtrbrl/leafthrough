import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { LeafThroughObject, type LeafThroughObjectOptions } from '../src/LeafThroughObject.js'
import { pause, stage } from './helpers.js'

/**
 * Hidden artwork mustn't show through. Every page that should be covered is printed pure red
 * and the rest in blues and greens; after drawing, no red may show on the faces of the pages in
 * view. Their edges are left out: seen from low down, a stack shows the edges of the sheets
 * under the top one, as paper does. So are the corners of the next pages and the edges of
 * rolled ones in the single layout, which show by design.
 */

const WIDTH = 400
const HEIGHT = 300
const SAFE = ['#1f6fe0', '#18a85a', '#16b5c4', '#6a3fd8']

function solid(color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 4
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 4, 4)
  return canvas
}

interface Camera {
  /** Where the camera stands, in page widths from the spine; the magazine faces +z. */
  at: [number, number, number]
  near: number
  far: number
  /** Scales the magazine and the camera's distance: a scene in other units. */
  scale?: number
  pixelRatio?: number
}

const FRONT: Camera = { at: [0, -0.8, 3.2], near: 0.1, far: 100 }
const REVERSE: Camera = { at: [0.2, -0.8, -3.2], near: 0.1, far: 100 }
const CAMERAS: Record<string, (at: Camera) => Camera> = {
  'a tight depth range': (c) => ({ ...c, near: 1, far: 8 }),
  'a wide depth range': (c) => ({ ...c, near: 0.01, far: 1000 }),
  // a 120 mm booklet in a scene in metres, as in an embedded gallery
  'a scene in metres': (c) => ({ ...c, scale: 0.12, near: 0.1, far: 100 }),
}

interface Probe {
  pageCount: number
  /** Whether page `i` should be out of sight. */
  hidden: (i: number) => boolean
  options: Partial<LeafThroughObjectOptions>
  camera: Camera
  /** The parts of the magazine to check, in its own units. */
  faces: THREE.Box2[]
  /** Moves the magazine on before drawing. */
  act?: (m: LeafThroughObject, settle: () => Promise<void>) => Promise<void>
}

// how many red pixels show
async function redPixels({ pageCount, hidden, options, camera: view, faces, act }: Probe) {
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true })
  renderer.setPixelRatio(view.pixelRatio ?? 1)
  renderer.setSize(WIDTH, HEIGHT)
  stage.append(renderer.domElement)
  const scene = new THREE.Scene()
  const sun = new THREE.DirectionalLight('#fff', 1.5)
  sun.position.set(-3, 1, 4)
  scene.add(new THREE.AmbientLight('#fff', 2), sun)
  const scale = view.scale ?? 1
  const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, view.near, view.far)
  camera.position.set(...view.at).multiplyScalar(scale)
  camera.lookAt(0, 0, 0)

  const pages = Array.from({ length: pageCount }, (_, i) => solid(hidden(i) ? '#ff0000' : SAFE[i % SAFE.length]))
  const magazine = new LeafThroughObject(
    { renderer, camera },
    {
      pages,
      preload: Infinity,
      loop: false,
      ...options,
      paper: { grain: false, showThrough: 0, ...options.paper },
      motion: { jitter: false, speed: 3, ...options.motion },
    },
  )
  magazine.scale.setScalar(scale)
  scene.add(magazine)

  // ticks as a render loop would until the pages are in and nothing moves
  const settle = async () => {
    let still = 0
    for (let i = 0; i < 400 && still < 5; i++) {
      still = magazine.tick(performance.now()) || magazine.turning ? 0 : still + 1
      await pause(10)
    }
  }
  try {
    await settle()
    await act?.(magazine, settle)
    renderer.render(scene, camera)

    const gl = renderer.getContext()
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const tests = faces.map((face) => faceTest(face, magazine, camera, width, height))
    const inside = (x: number, y: number) => tests.some((test) => test(x, y))
    let red = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]]
        if (r > 60 && g < r * 0.45 && b < r * 0.45 && inside(x, y)) red++
      }
    }
    return red
  } finally {
    magazine.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

// whether a pixel (from the bottom left, as read back) lies inside a box on the pages, on screen
function faceTest(face: THREE.Box2, magazine: LeafThroughObject, camera: THREE.Camera, width: number, height: number) {
  magazine.updateWorldMatrix(true, false)
  const corners = [
    [face.min.x, face.min.y],
    [face.max.x, face.min.y],
    [face.max.x, face.max.y],
    [face.min.x, face.max.y],
  ].map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(magazine.matrixWorld).project(camera)
    return new THREE.Vector2(((p.x + 1) / 2) * width, ((p.y + 1) / 2) * height)
  })
  return (x: number, y: number) => {
    let sign = 0
    for (let i = 0; i < 4; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % 4]
      const side = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x))
      if (side && sign && side !== sign) return false
      sign ||= side
    }
    return true
  }
}

const ASPECT = 1.377
// both pages of a spread, all but a sliver at their edges
const SPREAD = [-1, 0].map(
  (x) => new THREE.Box2(new THREE.Vector2(x + 0.02, -ASPECT / 2 + 0.02), new THREE.Vector2(x + 0.98, ASPECT / 2 - 0.02)),
)
// the page being read in the single layout, clear of the next pages' corners
const SINGLE = [new THREE.Box2(new THREE.Vector2(0.15, -ASPECT * 0.4), new THREE.Vector2(0.9, ASPECT * 0.4))]

// Spread, open at pages `page` and `page + 1`: from the front only those show, from behind
// only the outsides of the covers.
const spreadFront = (page: number) => (i: number) => i !== page && i !== page + 1
const spreadReverse = (count: number) => (i: number) => i !== 0 && i !== count - 1

const PAPERS: Record<string, LeafThroughObjectOptions['paper']> = {
  'default paper': {},
  'flat paper': { bulge: 0, wrinkles: 0 },
  'low bulge': { bulge: 0.1 },
}

describe('nothing shows through', () => {
  for (const [paperName, paper] of Object.entries(PAPERS)) {
    for (const [cameraName, camera] of Object.entries(CAMERAS)) {
      describe(`${paperName}, ${cameraName}`, () => {
        test('spread, from the front', async () => {
          const red = await redPixels({
            pageCount: 16,
            hidden: spreadFront(7),
            options: { layout: 'spread', startPage: 7, paper },
            camera: camera(FRONT),
            faces: SPREAD,
          })
          expect(red).toBe(0)
        })

        test('spread, from behind', async () => {
          const red = await redPixels({
            pageCount: 16,
            hidden: spreadReverse(16),
            options: { layout: 'spread', startPage: 7, paper },
            camera: camera(REVERSE),
            faces: SPREAD,
          })
          expect(red).toBe(0)
        })

        test('single, from the front', async () => {
          const red = await redPixels({
            pageCount: 16,
            hidden: (i) => i !== 6,
            options: { layout: 'single', startPage: 6, paper },
            camera: camera(FRONT),
            faces: SINGLE,
          })
          expect(red).toBe(0)
        })
      })
    }
  }

  test('a thick booklet', async () => {
    for (const camera of [FRONT, REVERSE]) {
      const hidden = camera === FRONT ? spreadFront(39) : spreadReverse(80)
      expect(await redPixels({ pageCount: 80, hidden, options: { layout: 'spread', startPage: 39 }, camera, faces: SPREAD })).toBe(0)
    }
    const red = await redPixels({
      pageCount: 80,
      hidden: (i) => i !== 40,
      options: { layout: 'single', startPage: 40 },
      camera: FRONT,
      faces: SINGLE,
    })
    expect(red).toBe(0)
  })

  test('at twice the pixel ratio', async () => {
    const camera = { ...FRONT, pixelRatio: 2 }
    const options = { layout: 'spread' as const, startPage: 7 }
    expect(await redPixels({ pageCount: 16, hidden: spreadFront(7), options, camera, faces: SPREAD })).toBe(0)
  })

  describe.each(['spread', 'single'] as const)('%s, after moving', (layout) => {
    const single = layout === 'single'
    // forward from page 5 to 7 in the spread (sheet 3 to 4), page 6 to 7 in the single layout
    const start = single ? 6 : 5
    const end = 7
    const hidden = single ? (i: number) => i !== end : spreadFront(end)
    const faces = single ? SINGLE : SPREAD
    const probe = (act: Probe['act'], from = start) =>
      redPixels({ pageCount: 16, hidden, options: { layout, startPage: from }, camera: FRONT, faces, act })

    test('a turn forward', async () => {
      expect(await probe(async (m, settle) => (m.next(), settle()))).toBe(0)
    })

    test('a turn back', async () => {
      expect(await probe(async (m, settle) => (m.prev(), settle()), single ? 8 : 9)).toBe(0)
    })

    test.runIf(!single)('a hover, then the pointer leaving', async () => {
      const red = await probe(async (m, settle) => {
        const at = screenAt(m, 0.6, 0)
        const send = (type: string) =>
          m.domElement.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', clientX: at.x, clientY: at.y, bubbles: true }))
        send('pointermove')
        for (let i = 0; i < 40; i++) {
          m.tick(performance.now())
          await pause(10)
        }
        send('pointerleave')
        await settle()
      }, end)
      expect(red).toBe(0)
    })
  })

  // The old way, depth bias without a gap, still holds from the front. From behind it can't:
  // it always brings the top sheet forward. This also shows the probe sees a leak.
  describe('depth bias without a gap', () => {
    const paper = { sheetGap: 0, depthBias: true, bulge: 0, wrinkles: 0 }

    test('from the front', async () => {
      const options = { layout: 'spread' as const, startPage: 7, paper }
      expect(await redPixels({ pageCount: 16, hidden: spreadFront(7), options, camera: FRONT, faces: SPREAD })).toBe(0)
    })

    test('from behind, it lets hidden pages through', async () => {
      const options = { layout: 'spread' as const, startPage: 7, paper }
      expect(await redPixels({ pageCount: 16, hidden: spreadReverse(16), options, camera: REVERSE, faces: SPREAD })).toBeGreaterThan(0)
    })
  })
})

// where a point on the magazine (in its own units) shows on screen
function screenAt(m: LeafThroughObject, x: number, y: number) {
  m.updateWorldMatrix(true, false)
  const camera = m.camera
  camera.updateWorldMatrix(true, false)
  const p = new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld).project(camera)
  const rect = m.domElement.getBoundingClientRect()
  return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
}
