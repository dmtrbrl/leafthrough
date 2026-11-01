import * as THREE from 'three'
import { expect, test } from 'vitest'
import { LeafThroughObject } from '../src/LeafThroughObject.js'
import { softensBasicShadows, withSoftBasicShadows } from '../src/paper/paperMaterial.js'
import { base, internals, pages, withMagazine } from './helpers.js'

const HARD_LOOKUP = /texture2D\( shadowMap, shadowCoord\.xy \)/g
// From three.js 0.182, PCF samples through the hardware depth comparison iOS Safari gets
// wrong, and the basic map is a depth texture the soft lookup reads. Older versions do PCF
// in the shader and pack depth into colour, so there's nothing to soften. CI runs both.
const hardwarePCF = THREE.ShaderChunk.shadowmap_pars_fragment.includes('sampler2DShadow')

test('the magazine uses a basic shadow map only where it can soften it', () =>
  withMagazine({}, (m) => {
    expect(softensBasicShadows()).toBe(hardwarePCF)
    expect(internals(m).renderer.shadowMap.type).toBe(hardwarePCF ? THREE.BasicShadowMap : THREE.PCFShadowMap)
  }))

test.skipIf(hardwarePCF)('before three.js 0.182 the soft lookup leaves shaders alone', () => {
  const shader = '#include <shadowmap_pars_fragment>\nvoid main() {}'
  expect(withSoftBasicShadows(shader)).toBe(shader)
})

test.runIf(hardwarePCF)('the soft lookup replaces the basic getShadow of the installed three.js, and nothing else', () => {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment
  const shader = withSoftBasicShadows('#include <shadowmap_pars_fragment>\nvoid main() {}')
  expect(shader).not.toContain('#include <shadowmap_pars_fragment>')
  expect(shader).toContain('shadowBilinearLit')
  // the PCF and VSM versions stay as three.js wrote them
  expect(shader.match(/float getShadow\(/g)).toHaveLength(chunk.match(/float getShadow\(/g)!.length)
  expect(shader).toContain('getShadow( sampler2DShadow shadowMap')
  expect(shader.match(HARD_LOOKUP)).toHaveLength(chunk.match(HARD_LOOKUP)!.length - 1)
  expect(shader.endsWith('void main() {}')).toBe(true)
})

test("a shader without three.js's shadow chunk is left alone", () => {
  expect(withSoftBasicShadows('void main() {}')).toBe('void main() {}')
})

// A box over a floor, lit from straight above and seen from straight above through a
// 64-pixel target, one shadow map texel to a pixel. Returns how shadowed each pixel of
// the middle row is, 0 to 1.
function shadowRow(soft: boolean) {
  const renderer = new THREE.WebGLRenderer()
  let error = false
  renderer.debug.onShaderError = () => (error = true)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.BasicShadowMap
  // the black ShadowMaterial over white: how dark a pixel is says how shadowed it is
  renderer.setClearColor('#fff')
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 10)
  camera.position.z = 5
  const light = new THREE.DirectionalLight('#fff', 1)
  light.position.set(0, 0, 5)
  light.castShadow = true
  light.shadow.mapSize.set(64, 64)
  Object.assign(light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 10 })
  light.shadow.radius = 3
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 1 }))
  if (soft) floor.material.onBeforeCompile = (program) => (program.fragmentShader = withSoftBasicShadows(program.fragmentShader))
  floor.receiveShadow = true
  // the box casts but isn't drawn, so the floor is all that's seen
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
  box.position.z = 1
  box.castShadow = true
  scene.add(light, floor, box)
  const target = new THREE.WebGLRenderTarget(64, 64)
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  const pixels = new Uint8Array(64 * 64 * 4)
  renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels)
  target.dispose()
  renderer.dispose()
  expect(error).toBe(false)
  return Array.from({ length: 64 }, (_, x) => 1 - pixels[(32 * 64 + x) * 4] / 255)
}

test.runIf(hardwarePCF)('under a basic shadow map, the soft lookup shades like PCF: dark under the caster, soft at its edge', () => {
  const hard = shadowRow(false)
  const soft = shadowRow(true)
  const between = (row: number[]) => row.filter((v) => v > 0.1 && v < 0.9).length
  for (const row of [hard, soft]) {
    expect(row[32]).toBeGreaterThan(0.9)
    expect(row[2]).toBeLessThan(0.1)
  }
  expect(between(hard)).toBe(0)
  expect(between(soft)).toBeGreaterThan(2)
})

test('the paper compiles with its soft lookup under a basic shadow map', () => {
  const renderer = new THREE.WebGLRenderer()
  let error = false
  renderer.debug.onShaderError = () => (error = true)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.BasicShadowMap
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20)
  camera.position.set(0.5, 0, 3)
  const magazine = new LeafThroughObject({ renderer, camera }, { ...base, pages: pages(4), lighting: { shadows: true } })
  const sun = new THREE.DirectionalLight('#fff', 1)
  sun.position.set(-1, 1, 4)
  sun.castShadow = true
  const scene = new THREE.Scene().add(magazine, sun)
  magazine.tick()
  renderer.render(scene, camera)
  expect(error).toBe(false)
  magazine.dispose()
  renderer.dispose()
})
