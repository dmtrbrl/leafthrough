import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { LeafThroughObject } from '../src/LeafThroughObject.js'
import { SharedResources, sharedResources } from '../src/shared.js'
import { base, pages, stage } from './helpers.js'

// What magazines on one renderer share, and that none breaks it for the others.

test('a shared resource is made for the first user and freed with the last', () => {
  const shared = new SharedResources()
  const make = vi.fn(() => ({ dispose: vi.fn() }))
  const first = shared.acquire('thing', make)
  expect(shared.acquire('thing', make)).toBe(first)
  expect(make).toHaveBeenCalledTimes(1)
  shared.release('thing')
  expect(first.dispose).not.toHaveBeenCalled()
  shared.release('thing')
  expect(first.dispose).toHaveBeenCalledTimes(1)
  // the next user gets a fresh one
  expect(shared.acquire('thing', make)).not.toBe(first)
  shared.release('thing')
})

function view(renderer: THREE.WebGLRenderer) {
  renderer.setSize(200, 150)
  stage.append(renderer.domElement)
  const camera = new THREE.PerspectiveCamera(40, 200 / 150, 0.1, 100)
  camera.position.z = 4
  const make = (options: Partial<ConstructorParameters<typeof LeafThroughObject>[1]> = {}) =>
    new LeafThroughObject({ renderer, camera }, { ...base, layout: 'spread', pages: pages(4), paper: { grain: true }, ...options })
  return { make, dispose: () => (renderer.dispose(), renderer.domElement.remove()) }
}

// the grain texture the first sheet draws with
const patternOf = (m: LeafThroughObject) =>
  (m as unknown as { view: { engine: { sheets: { uniforms: { uPattern: THREE.IUniform<THREE.Texture> } }[] } } }).view.engine.sheets[0].uniforms
    .uPattern.value

test('magazines on one renderer share the built-in grain, which outlives all but the last', () => {
  const a = view(new THREE.WebGLRenderer())
  const b = view(new THREE.WebGLRenderer())
  const first = a.make()
  const second = a.make()
  const elsewhere = b.make()
  const plain = a.make({ paper: { grain: false } })
  try {
    const pattern = patternOf(first)
    expect(patternOf(second)).toBe(pattern)
    // another renderer uploads its own texture of the same drawing
    expect(patternOf(elsewhere)).not.toBe(pattern)
    expect(patternOf(elsewhere).image).toBe(pattern.image)
    expect(patternOf(plain)).not.toBe(pattern)

    const disposed = vi.fn()
    pattern.addEventListener('dispose', disposed)
    first.dispose()
    expect(disposed).not.toHaveBeenCalled()
    // a rebuild keeps it too
    second.update({ layout: 'single' })
    expect(patternOf(second)).toBe(pattern)
    second.dispose()
    expect(disposed).toHaveBeenCalledTimes(1)
    // and the next magazine gets a fresh texture of the same drawing
    const later = a.make()
    expect(patternOf(later)).not.toBe(pattern)
    expect(patternOf(later).image).toBe(pattern.image)
    later.dispose()
  } finally {
    elsewhere.dispose()
    plain.dispose()
    a.dispose()
    b.dispose()
  }
})

test('the shared resources belong to the renderer', () => {
  const one = new THREE.WebGLRenderer()
  const two = new THREE.WebGLRenderer()
  expect(sharedResources(one)).toBe(sharedResources(one))
  expect(sharedResources(two)).not.toBe(sharedResources(one))
  one.dispose()
  two.dispose()
})
