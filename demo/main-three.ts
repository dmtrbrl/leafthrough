import { LeafThroughObject } from 'leafthrough'
import * as THREE from 'three'
import { createEnvelope, ENVELOPE } from './envelope'
import { demoPages } from './pages'
import './style.css'
import './three.css'

// This application owns the scene, lighting, camera and animation loop. LeafThroughObject
// is an ordinary scene object: the envelope is native three.js geometry around it.
const host = document.getElementById('scene')!
const hint = document.getElementById('scene-hint')!
const button = document.getElementById('scene-button') as HTMLButtonElement
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.domElement.setAttribute('aria-label', 'Interactive magazine. Use the arrow keys to turn pages after opening the envelope.')
renderer.domElement.tabIndex = 0
host.append(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
const sunPosition: [number, number, number] = [-3.5, 2.8, 6]
// The demo is the motion, so it plays whatever the system's Reduce Motion setting says, the
// magazine's hover and wobble included: with the reveal skipped, it looked like nothing happened.
const magazine = new LeafThroughObject({ renderer, camera }, {
  pages: demoPages,
  interaction: { keyboard: true },
  lighting: { sun: { position: sunPosition } },
  motion: { reducedMotion: false },
})
magazine.enabled = false
scene.add(magazine)
scene.add(new THREE.HemisphereLight('#fffdf8', '#c2bba9', 1.7))
const sun = new THREE.DirectionalLight('#fffaf0', 1.8)
sun.position.set(...sunPosition)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -3.8, right: 2.4, top: 2, bottom: -2, near: 0.5, far: 14 })
sun.shadow.bias = -0.0007
sun.shadow.normalBias = 0.002
sun.shadow.radius = 3
scene.add(sun, sun.target)
const table = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.16 }))
table.position.z = -0.0005
table.receiveShadow = true
scene.add(table)

const mail = createEnvelope(renderer)
const envelope = mail.group
scene.add(envelope)
const TRAVEL = ENVELOPE.width / 2 + 0.5 + 0.06
const AWAY = 3.6
const SLIDE_FROM = 0.2
const CLEARANCE = ENVELOPE.flapLength + 0.02
const PRESSED = 0.08
const DURATION = 2.4
let progress = 0
let ready = false
let autoTurnPending = false
let state: 'sealed' | 'opening' | 'out' | 'closing' | 'returning' = 'sealed'

const ease = (t: number) => {
  t = THREE.MathUtils.clamp(t, 0, 1)
  return t * t * t * (t * (6 * t - 15) + 10)
}
const part = (from: number, to: number) => ease((progress - from) / (to - from))

function place() {
  const slide = part(SLIDE_FROM, 1)
  const away = slide
  const spread = magazine.layout === 'spread'
  const start = spread ? -TRAVEL : 0
  mail.setOpen(part(0, 0.25))
  // On a narrow screen the magazine stays put: draw the sleeve off it instead.
  envelope.position.x = start + 0.5 - (spread ? 0 : TRAVEL * slide) - AWAY * away
  envelope.visible = away < 1
  magazine.position.x = spread ? start + TRAVEL * slide : 0
  // Release the pressure once the spine passes the mouth. By the time it clears the
  // open flap as well, the magazine has its full depth and can start turning pages.
  const clearance = magazine.position.x - (envelope.position.x + ENVELOPE.width / 2)
  magazine.position.z = 0.0045 * (1 - part(0.82, 1))
  magazine.scale.z = THREE.MathUtils.lerp(PRESSED, 1, ease(clearance / CLEARANCE))
  if (autoTurnPending && clearance >= CLEARANCE) {
    autoTurnPending = false
    // The API is zero-based: show printed pages 4–5 while the envelope withdraws.
    if (spread) magazine.goTo(3, { animate: true })
  }
}

function frame() {
  const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
  const headerHeight = document.querySelector('header')!.getBoundingClientRect().height
  const side = Math.min(80, Math.max(22, width * 0.05))
  const area = { left: side, right: width - side, top: headerHeight + 24, bottom: height - 112 }
  const pages = magazine.bounds.pages
  const box = magazine.layout === 'spread'
    ? { x: pages.x, y: -0.82, w: pages.width, h: 1.64 }
    : { x: -0.28, y: -1, w: 1.56, h: 2 }
  const scale = 0.9 * Math.max(1, Math.min((area.right - area.left) / box.w, (area.bottom - area.top) / box.h))
  const distance = height / scale / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const dx = (area.left + area.right) / 2 - width / 2
  const dy = (area.top + area.bottom) / 2 - height / 2
  // Follow the reveal gently; the sealed envelope starts in the centre of the reading area.
  const sealedCentre = magazine.layout === 'spread' ? -TRAVEL + 0.5 : box.x + box.w / 2
  const centre = THREE.MathUtils.lerp(sealedCentre, box.x + box.w / 2, (0.65 * part(SLIDE_FROM, 1) + 0.35 * part(0.58, 1)))
  camera.position.set(centre - dx / scale, box.y + box.h / 2 + dy / scale, distance)
  camera.updateMatrixWorld()
}

function advance(dt: number) {
  // Riffle duration depends on the current page. Wait for the actual cover and the
  // final sheet to settle, then run the whole return without a mid-motion stop.
  if (state === 'closing' && magazine.page === 0 && !magazine.turning) state = 'returning'
  if (state === 'opening') {
    progress = Math.min(1, progress + dt / DURATION)
    if (progress === 1) {
      state = 'out'
      magazine.enabled = true
      sync()
    }
  } else if (state === 'returning') {
    progress = Math.max(0, progress - dt / DURATION)
    if (progress === 0) {
      state = 'sealed'
      sync()
    }
  }
}

function open() {
  if (state !== 'sealed' || !ready) return
  autoTurnPending = magazine.layout === 'spread'
  state = 'opening'
  renderer.domElement.focus({ preventScroll: true })
  sync()
}
function putBack() {
  if (state !== 'out') return
  state = 'closing'
  magazine.enabled = false
  magazine.goTo(0, { animate: true })
  sync()
}
function sync() {
  hint.textContent = !ready ? 'Preparing your issue…' : state === 'out'
    ? 'Drag a page, click it, or use the arrow keys.' : state === 'sealed' ? 'The new issue has arrived.'
    : state === 'closing' || state === 'returning' ? 'Putting your issue away…' : 'A little something to leaf through.'
  button.textContent = state === 'out' ? 'Put it back' : 'Open the envelope'
  button.disabled = !ready || (state !== 'sealed' && state !== 'out')
  host.dataset.state = state
}
magazine.addEventListener('ready', () => { ready = true; sync() })
button.addEventListener('click', () => state === 'out' ? putBack() : open())

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
function overEnvelope(e: MouseEvent) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  return envelope.visible && raycaster.intersectObject(envelope, true).length > 0
}
renderer.domElement.addEventListener('pointermove', (e) => {
  renderer.domElement.style.cursor = magazine.covers(e.clientX, e.clientY) ? 'grab'
    : ready && state === 'sealed' && overEnvelope(e) ? 'pointer' : ''
})
renderer.domElement.addEventListener('click', (e) => { if (state === 'sealed' && overEnvelope(e)) open() })
renderer.domElement.addEventListener('keydown', (e) => {
  if (state === 'sealed' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open() }
})

function resize() {
  const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
const observer = new ResizeObserver(resize)
observer.observe(host)
resize()
sync()
let last = performance.now()
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  advance(dt)
  place()
  frame()
  magazine.tick(now)
  renderer.render(scene, camera)
})

// Vite replaces this module when editing; release its loop, observers and GPU resources.
import.meta.hot?.dispose(() => {
  renderer.setAnimationLoop(null)
  observer.disconnect()
  magazine.dispose()
  mail.dispose()
  table.geometry.dispose()
  table.material.dispose()
  sun.shadow.map?.dispose()
  renderer.dispose()
  renderer.domElement.remove()
})
