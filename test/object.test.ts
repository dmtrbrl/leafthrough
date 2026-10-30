import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { LeafThroughObject, type LeafThroughObjectOptions } from '../src/LeafThroughObject.js'
import { base, pages, pause, stage } from './helpers.js'

/**
 * A scene of our own with the magazine in it, lying on a table: turned flat, scaled up and
 * moved off centre, seen from above at an angle. Runs `fn`, then disposes everything.
 */
async function withObject<T>(options: Partial<LeafThroughObjectOptions>, fn: (m: LeafThroughObject, scene: THREE.Scene) => T | Promise<T>) {
  const renderer = new THREE.WebGLRenderer()
  renderer.setSize(700, 480)
  stage.append(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 700 / 480, 0.1, 100)
  camera.position.set(0.5, 6, 4)
  camera.lookAt(0.5, 0, 0)
  const magazine = new LeafThroughObject({ renderer, camera }, { ...base, pages: pages(6), ...options })
  magazine.rotation.x = -Math.PI / 2
  magazine.position.x = 0.5
  magazine.scale.setScalar(1.5)
  scene.add(magazine)
  try {
    await whenReady(magazine)
    return await fn(magazine, scene)
  } finally {
    magazine.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

// ticks the magazine every few ms, as a render loop would, until its first pages are in
async function whenReady(magazine: LeafThroughObject) {
  let ready = false
  magazine.addEventListener('ready', () => (ready = true))
  for (let i = 0; i < 200 && !ready; i++) {
    magazine.tick(performance.now())
    await pause(10)
  }
  expect(ready).toBe(true)
}

// where a point on the magazine (in its own units) shows on screen
function screenAt(m: LeafThroughObject, x: number, y: number) {
  m.updateWorldMatrix(true, false)
  m.camera.updateWorldMatrix(true, false)
  const p = new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld).project(m.camera)
  const rect = m.domElement.getBoundingClientRect()
  return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
}

function pointer(m: LeafThroughObject, at: { x: number; y: number }) {
  return (type: string, { dx = 0 } = {}) =>
    m.domElement.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: at.x + dx, clientY: at.y, bubbles: true }),
    )
}

describe.each(['single', 'spread'] as const)('%s layout', (layout) => {
  test('fires ready, then turns with next(), prev() and goTo()', () =>
    withObject({ layout }, (m) => {
      const changes: number[] = []
      m.addEventListener('pagechange', (e) => changes.push(e.detail.page))
      expect(m.page).toBe(0)
      expect(m.next()).toBe(true)
      m.tick()
      expect(m.page).toBe(1)
      m.prev()
      m.tick()
      expect(m.page).toBe(0)
      m.goTo(3)
      m.tick()
      expect(m.visiblePages).toContain(3)
      expect(changes.length).toBe(3)
    }))

  test('asks for a frame when something changes between frames', () =>
    withObject({ layout }, (m) => {
      let changes = 0
      m.addEventListener('change', () => changes++)
      m.next()
      expect(changes).toBeGreaterThan(0)
      expect(m.tick()).toBe(true)
    }))

  test('a click on the page turns it, wherever the magazine lies', () =>
    withObject({ layout }, (m) => {
      const at = screenAt(m, 0.8, 0)
      expect(m.covers(at.x, at.y)).toBe(true)
      const send = pointer(m, at)
      send('pointerdown')
      send('pointerup')
      expect(m.page).toBe(1)
    }))

  test('a long drag turns, a cancelled one goes back', () =>
    withObject({ layout }, (m) => {
      const send = pointer(m, screenAt(m, 0.8, 0))
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

  test('presses off the magazine, or while it is hidden, are left alone', () =>
    withObject({ layout }, (m) => {
      const off = screenAt(m, 3, 0)
      expect(m.covers(off.x, off.y)).toBe(false)
      pointer(m, off)('pointerdown')
      pointer(m, off)('pointerup')
      expect(m.page).toBe(0)

      const on = screenAt(m, 0.8, 0)
      m.visible = false
      expect(m.covers(on.x, on.y)).toBe(false)
      pointer(m, on)('pointerdown')
      pointer(m, on)('pointerup')
      expect(m.page).toBe(0)
    }))

  test('takes no input while not enabled, and keeps its page', () =>
    withObject({ layout }, (m) => {
      const on = screenAt(m, 0.8, 0)
      m.enabled = false
      expect(m.covers(on.x, on.y)).toBe(false)
      pointer(m, on)('pointerdown')
      pointer(m, on)('pointerup')
      expect(m.page).toBe(0)
      m.enabled = true
      pointer(m, on)('pointerdown')
      pointer(m, on)('pointerup')
      expect(m.page).toBe(1)
    }))

  test('dragging follows a rotated magazine rather than the screen x axis', () =>
    withObject({ layout }, (m) => {
      m.rotation.set(0, 0, Math.PI / 2)
      m.camera.position.set(0.5, 0, 6)
      m.camera.lookAt(0.5, 0, 0)
      const from = screenAt(m, 0.8, 0)
      const to = screenAt(m, -3, 0)
      const send = (type: string, at = from) => m.domElement.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, clientX: at.x, clientY: at.y, bubbles: true,
      }))
      send('pointerdown')
      send('pointermove', to)
      send('pointerup', to)
      expect(m.page).toBe(1)
    }))

  test('disabling during a hold releases the gesture and stops its timer', () =>
    withObject({ layout }, async (m) => {
      const send = pointer(m, screenAt(m, 0.8, 0))
      send('pointerdown')
      expect(m.turning).toBe(true)
      m.enabled = false
      await pause(900)
      m.tick()
      expect(m.turning).toBe(false)
      expect(m.page).toBe(0)
      m.enabled = true
      send('pointerdown')
      send('pointerup')
      expect(m.page).toBe(1)
    }))

  test('bounds describe the pages in their own units', () =>
    withObject({ layout, pageAspect: 1 }, (m) => {
      const { pages, reach } = m.bounds
      expect(pages).toEqual(layout === 'spread' ? { x: -1, y: -0.5, width: 2, height: 1 } : { x: 0, y: -0.5, width: 1, height: 1 })
      expect(reach.x).toBeLessThan(pages.x)
      expect(reach.width).toBeGreaterThan(pages.width)
    }))
})

test('a closed spread only takes presses on its cover side', () =>
  withObject({ layout: 'spread' }, (m) => {
    const left = screenAt(m, -0.8, 0)
    expect(m.covers(left.x, left.y)).toBe(false)
    m.goTo(2)
    m.tick()
    expect(m.covers(left.x, left.y)).toBe(true)
  }))

test('update() rebuilds in place and keeps the page', () =>
  withObject({ layout: 'spread' }, (m) => {
    m.goTo(3)
    m.update({ layout: 'single' })
    expect(m.layout).toBe('single')
    expect(m.page).toBe(3)
    expect(m.children.length).toBe(1)
  }))

test('dispose() takes it out of the scene', () =>
  withObject({}, (m, scene) => {
    m.dispose()
    expect(scene.children).not.toContain(m)
    expect(m.next()).toBe(false)
  }))

// Draws `objects` head-on into a 64 × 64 target and returns a reader for the alpha at a point
// (x, y in the magazine's own units, the view spanning -1 to 1 both ways).
async function renderOffscreen(build: (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => LeafThroughObject[]) {
  const renderer = new THREE.WebGLRenderer()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 5
  const scene = new THREE.Scene()
  const objects = build(renderer, camera)
  scene.add(...objects)
  for (const object of objects) await whenReady(object)
  for (const object of objects) object.tick()
  const target = new THREE.WebGLRenderTarget(64, 64)
  renderer.setClearColor(0x000000, 0)
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  const pixel = new Uint8Array(4)
  const alphaAt = (x: number, y: number) => {
    renderer.readRenderTargetPixels(target, Math.round(((x + 1) / 2) * 63), Math.round(((y + 1) / 2) * 63), 1, 1, pixel)
    return pixel[3]
  }
  return {
    alphaAt,
    renderer,
    dispose() {
      objects.forEach((object) => object.dispose())
      target.dispose()
      renderer.dispose()
    },
  }
}

// a cover whose half nearest the spine is transparent
function halfCover() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'red'
  ctx.fillRect(16, 0, 16, 32)
  return canvas
}

// one sheet, so nothing lies under the cover's cut-away half
test.each([true, false])('paper.cutout %s: transparent parts of a page are no paper', async (cutout) => {
  const view = await renderOffscreen((renderer, camera) => [
    new LeafThroughObject({ renderer, camera }, { ...base, layout: 'spread', pageAspect: 1, pages: [halfCover(), ...pages(1)], paper: { grain: false, cutout } }),
  ])
  try {
    expect(view.alphaAt(0.75, 0)).toBe(255)
    expect(view.alphaAt(0.25, 0)).toBe(cutout ? 0 : 255)
  } finally {
    view.dispose()
  }
})

test("magazines sharing a renderer don't share each other's shaders", async () => {
  let spread!: LeafThroughObject
  let single!: LeafThroughObject
  const view = await renderOffscreen((renderer, camera) => {
    spread = new LeafThroughObject({ renderer, camera }, { ...base, layout: 'spread', pageAspect: 1, pages: pages(4) })
    single = new LeafThroughObject({ renderer, camera }, { ...base, layout: 'single', pageAspect: 1.5, pages: pages(4) })
    single.position.y = -0.2
    return [spread, single]
  })
  try {
    const programOf = (object: LeafThroughObject) => {
      const mesh = object.children[0].children[0] as THREE.Mesh
      return (view.renderer.properties.get(mesh.material) as { currentProgram?: unknown }).currentProgram
    }
    expect(programOf(spread)).toBeDefined()
    expect(programOf(spread)).not.toBe(programOf(single))
  } finally {
    view.dispose()
  }
})

// Read the actual shadow on a receiving plane beyond the page's screen footprint. This
// exercises three.js's point-light distance pass as well as the directional depth pass.
test.each([['directional', 'cutout'], ['point', 'cutout'], ['directional', 'trim'], ['point', 'trim']] as const)(
  '%s shadows follow %s paper', async (kind, silhouette) => {
  const renderer = new THREE.WebGLRenderer({ alpha: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.BasicShadowMap
  const target = new THREE.WebGLRenderTarget(256, 128)
  const camera = new THREE.OrthographicCamera(-1, 3, 1, -1, 0.1, 20)
  camera.position.set(0, 0, 6)
  const scene = new THREE.Scene()
  const light = kind === 'point' ? new THREE.PointLight(0xffffff, 10) : new THREE.DirectionalLight(0xffffff, 2)
  light.position.set(-3, 0, 2)
  light.castShadow = true
  light.shadow.mapSize.set(512, 512)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = 20
  if (light instanceof THREE.DirectionalLight) {
    Object.assign(light.shadow.camera, { left: -5, right: 5, top: 3, bottom: -3 })
    scene.add(light.target)
  }
  scene.add(light)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 1 }))
  floor.position.z = -1
  floor.receiveShadow = true
  scene.add(floor)
  const magazine = new LeafThroughObject({ renderer, camera }, {
    ...base, layout: silhouette === 'cutout' ? 'spread' : 'single', pageAspect: 1,
    pages: silhouette === 'cutout' ? [halfCover(), ...pages(1)] : pages(1),
    paper: { grain: false, cutout: silhouette === 'cutout', bulge: 0, wrinkles: 0 }, lighting: { shadows: true },
  })
  magazine.position.x = -0.5
  scene.add(magazine)
  try {
    await whenReady(magazine)
    magazine.tick()
    if (silhouette === 'trim') {
      // The single engine trims buried sheets to the top page's edge. Force that edge
      // halfway across this sheet, so the shadow must lose its otherwise opaque right half.
      const engine = (magazine as unknown as { view: { engine: { sheets: { uniforms: { uTrim: THREE.IUniform<THREE.Vector3> } }[] } } }).view.engine
      engine.sheets[0].uniforms.uTrim.value.set(1, 0.5, 0.5)
    }
    renderer.setClearColor(0, 0)
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const pixel = new Uint8Array(4)
    const alphaAt = (x: number) => {
      renderer.readRenderTargetPixels(target, Math.round((x + 1) / 4 * 255), 64, 1, 1, pixel)
      return pixel[3]
    }
    expect(alphaAt(silhouette === 'cutout' ? 1.9 : 1)).toBeGreaterThan(200)
    expect(alphaAt(silhouette === 'cutout' ? 1 : 1.9)).toBeLessThan(10)
  } finally {
    magazine.dispose()
    floor.geometry.dispose()
    floor.material.dispose()
    light.shadow.map?.dispose()
    target.dispose()
    renderer.dispose()
  }
})

// the private state these tests look at
type ObjectInternals = {
  view: { engine: { sheets: { mesh: THREE.Mesh }[] }; settings: { paper: { sheetGap: number; depthBias: boolean } } }
}
const viewOf = (m: LeafThroughObject) => (m as unknown as ObjectInternals).view

test('sheets stand apart and sort by depth alone, unless told otherwise', () =>
  withObject({}, (m) => {
    expect(viewOf(m).settings.paper).toMatchObject({ sheetGap: 0.0005, depthBias: false })
    m.tick()
    expect(viewOf(m).engine.sheets.every(({ mesh }) => !(mesh.material as THREE.Material).polygonOffset)).toBe(true)
    m.update({ paper: { grain: false, sheetGap: 0, depthBias: true } })
    m.tick()
    expect(viewOf(m).settings.paper).toMatchObject({ sheetGap: 0, depthBias: true })
    expect(viewOf(m).engine.sheets.every(({ mesh }) => (mesh.material as THREE.Material).polygonOffset)).toBe(true)
  }))

test.each(['single', 'spread'] as const)('%s: lighting.shadows turns on and off without a rebuild, and stays', (layout) =>
  withObject({ layout, lighting: { shadows: true } }, (m) => {
    const { engine } = viewOf(m)
    const shadowed = () => engine.sheets.some(({ mesh }) => mesh.castShadow || mesh.receiveShadow)
    expect(shadowed()).toBe(true)
    m.update({ lighting: { shadows: false } })
    expect(viewOf(m).engine).toBe(engine)
    m.next()
    for (let i = 0; i < 5; i++) m.tick()
    expect(shadowed()).toBe(false)
    m.update({ lighting: { shadows: true } })
    m.tick()
    expect(viewOf(m).engine).toBe(engine)
    expect(shadowed()).toBe(true)
    m.update({ lighting: { shadows: true, sun: { position: [1, 1, 1] } } })
    expect(viewOf(m).engine).not.toBe(engine)
  }))

// squeezes the sheets towards the spine as `keep` goes from 1 to 0
const squeeze = (keep: THREE.IUniform<number>) => ({
  glsl: /* glsl */ `
    uniform float uKeep;
    vec3 deformSheet(vec3 p, vec2 uv) {
      return vec3(p.x * uKeep, p.y, p.z);
    }`,
  uniforms: { uKeep: keep },
})

// The pages and the shadow they cast both follow the deform, and its uniforms are read live:
// the uniform here is a plain object whose value changes after the shaders are built.
test.each([
  ['single', 'directional'],
  ['spread', 'point'],
] as const)('%s: deform reshapes the paper and its %s shadow', async (layout, kind) => {
  const renderer = new THREE.WebGLRenderer({ alpha: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.BasicShadowMap
  const target = new THREE.WebGLRenderTarget(256, 128)
  const camera = new THREE.OrthographicCamera(-1, 3, 1, -1, 0.1, 20)
  camera.position.set(0, 0, 6)
  const scene = new THREE.Scene()
  const light = kind === 'point' ? new THREE.PointLight(0xffffff, 10) : new THREE.DirectionalLight(0xffffff, 2)
  light.position.set(-3, 0, 2)
  light.castShadow = true
  light.shadow.mapSize.set(512, 512)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = 20
  if (light instanceof THREE.DirectionalLight) {
    Object.assign(light.shadow.camera, { left: -5, right: 5, top: 3, bottom: -3 })
    scene.add(light.target)
  }
  scene.add(light)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 1 }))
  floor.position.z = -1
  floor.receiveShadow = true
  scene.add(floor)
  const keep = { value: 1 }
  const magazine = new LeafThroughObject({ renderer, camera }, {
    ...base, layout, pageAspect: 1, pages: pages(layout === 'spread' ? 2 : 1),
    paper: { grain: false, bulge: 0, wrinkles: 0 }, lighting: { shadows: true }, deform: squeeze(keep),
  })
  magazine.position.x = -0.5
  scene.add(magazine)
  const pixel = new Uint8Array(4)
  const alphaAt = (x: number) => {
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, Math.round(((x + 1) / 4) * 255), 64, 1, 1, pixel)
    return pixel[3]
  }
  try {
    await whenReady(magazine)
    magazine.tick()
    renderer.setClearColor(0, 0)
    // the page lies from -0.5 to 0.5, its shadow from 0.75 to 2.25
    expect(alphaAt(0)).toBe(255)
    expect(alphaAt(1.5)).toBeGreaterThan(200)
    keep.value = 0.1
    expect(alphaAt(0)).toBeLessThan(10)
    expect(alphaAt(1.5)).toBeLessThan(10)
  } finally {
    magazine.dispose()
    floor.geometry.dispose()
    floor.material.dispose()
    light.shadow.map?.dispose()
    target.dispose()
    renderer.dispose()
  }
})

test('deform: new uniform values or objects apply in place, new GLSL rebuilds', () =>
  withObject({ deform: squeeze({ value: 1 }) }, (m) => {
    const { engine } = viewOf(m)
    m.update({ deform: squeeze({ value: 0.5 }) })
    expect(viewOf(m).engine).toBe(engine)
    const mesh = viewOf(m).engine.sheets[0].mesh
    const program = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }
    ;(mesh.material as THREE.Material).onBeforeCompile(program as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)
    expect(program.uniforms.uKeep.value).toBe(0.5)
    m.update({ deform: { ...squeeze({ value: 0.5 }), glsl: squeeze({ value: 0 }).glsl.replace('p.y', 'p.y * 1.0') } })
    expect(viewOf(m).engine).not.toBe(engine)
  }))

// The depth pass's shader stands in for the distance pass's too: three.js renamed that one
// (0.160 calls it distanceRGBA), and both have the chunks the paper hooks into.
test('without a deform the shaders are as before; with one, every pass applies it', () => {
  const compile = (material: THREE.Material, shader: 'standard' | 'depth') => {
    const program = { uniforms: {}, vertexShader: THREE.ShaderLib[shader].vertexShader, fragmentShader: THREE.ShaderLib[shader].fragmentShader }
    material.onBeforeCompile(program as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)
    return program.vertexShader
  }
  const shaders = (m: LeafThroughObject) => {
    const mesh = viewOf(m).engine.sheets[0].mesh
    return [compile(mesh.material as THREE.Material, 'standard'), compile(mesh.customDepthMaterial!, 'depth'), compile(mesh.customDistanceMaterial!, 'depth')]
  }
  return withObject({}, (plain) => {
    for (const shader of shaders(plain)) expect(shader).not.toContain('deformSheet')
    plain.update({ deform: squeeze({ value: 1 }) })
    for (const shader of shaders(plain)) expect(shader).toContain('sheetDeformed(')
  })
})
