import * as THREE from 'three'
import type { Engine, EngineContext, EngineMetrics } from '../engine.js'
import type { ResolvedSettings } from '../options.js'
import { disposeSheetMesh, layerSheet, type SheetMesh } from '../paper/paperMaterial.js'
import { createSingleGeometry, createSingleSheet, type SingleSheetUniforms } from './singleSheet.js'

// One page in view. Turned pages swing around the spine and roll up around a cone behind
// the magazine; the unread pile bulges up off the spine. After the last page everything
// settles flat again and the magazine starts over.
const HOLD = {
  startTime: 0.22,
  firstFlipTime: 1.4,
  fastestFlipTime: 1,
  speedUpSheets: 7,
  firstGapShare: 0.16,
  fastestGapShare: 0.1,
  moveSlopPx: 40,
}
const DRAG = {
  progressSmoothTime: 0.9,
  clickSlopPx: 5,
  claimSteepness: 1.6, // a touch swipe this much flatter than vertical turns pages instead of scrolling
  claimAfterPx: 4,
  fallTime: 1.3,
  fallTimeExponent: 0.5,
}
const CLICK = { flipTime: 1.2, settlePower: 0.8 }
const GRAB = { smoothTime: 0.05 }
const WOBBLE = { tiltDeg: 8, flipTimeMin: 0.95, flipTimeMax: 1.08 }
const ROLL = {
  spineOpenStartDeg: 100, // how far read pages swing round before they start rolling
  spineOpenEndDeg: 190,
  spineOpenPower: 4,
  coneEvenPower: 6,
  coverTopRadius: 0.04,
  backTopRadius: 0.18,
  coverBottomRadius: 0.01,
  backBottomRadius: 0.05,
  radiusSpacingClump: 7.5,
  radiusSpacingSeed: 41.5,
  fallDelayPages: 15, // read pages this far back settle flat behind everything
  fallDurationPages: 3,
}
const SHAPE = { midLeadPower: 2, midBow: 2, midBowFlatFrom: 0.3, midBowFlatTo: 0.8, midRollScale: 2.5 }
const PILE = {
  liftHeight: 0.08,
  liftPeakX: 0.4,
  liftEdgeDrop: 0.5,
  liftShutShare: 0.67,
  liftDepthFalloff: 0.5,
  coneTaper: -0.6,
  renderDepth: 3,
}
const BOOK = { pushBack: 0.05, pushRight: 0.02 }
const CATCH_UP = { clump: 1.6, seed: 41 }

const TAU = Math.PI * 2
const clamp = THREE.MathUtils.clamp
const smooth = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}
const hash = (a: number, b: number) => {
  const s = 43758.5453 * Math.sin(12.9898 * a + 78.233 * b)
  return s - Math.floor(s)
}

interface Wobble {
  tiltDeg: number
  flipTime: number
}
interface Sheet {
  index: number
  mesh: SheetMesh
  uniforms: SingleSheetUniforms
  progress: number
  grabX: number
  grabXTarget: number
  grabY: number
  grabYTarget: number
  wobble: Wobble
}
interface Flight {
  sheet: Sheet
  from: number
  to: number
  start: number
  duration: number
  launch?: number
}
interface Drag {
  sheet: Sheet
  forward: boolean
  base: number
  progress: number
  rectWidth: number
  speed: number
}
interface Hold {
  forward: boolean
  x: number
  y: number
  count: number
  fired: boolean
  timer: ReturnType<typeof setTimeout>
}

/**
 * One page at a time: turned pages swing round the spine and roll up behind the magazine.
 */
export class SingleEngine implements Engine {
  readonly group = new THREE.Group() // the book, nudged back and right as you read
  readonly maxPosition: number

  private readonly settings: ResolvedSettings
  private readonly halfHeight: number
  private readonly liftHeight: number
  private readonly camera: THREE.PerspectiveCamera
  private readonly canvas: HTMLCanvasElement
  private readonly hitArea: HTMLElement
  private readonly metrics: EngineMetrics
  private readonly geometry: THREE.BufferGeometry
  private readonly sheets: Sheet[]
  private readonly count: number
  private readonly radiusSpacing: number[]
  private readonly catchUp: number[]
  private readonly abort = new AbortController()

  private current: number
  private flights: Flight[] = []
  private drag: Drag | null = null
  // the pointer that started the gesture; other pointers are ignored until it lifts
  private press: { id: number; x: number; y: number } | null = null
  private hold: Hold | null = null
  private touch: { x: number; y: number; claimed: boolean } | null = null
  private dirty = true
  private last = 0

  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  private readonly hit = new THREE.Vector3()
  private readonly spine = new THREE.Vector3()

  constructor(ctx: EngineContext) {
    this.settings = ctx.settings
    this.halfHeight = ctx.settings.pageAspect / 2
    this.liftHeight = PILE.liftHeight * ctx.settings.paper.bulge
    this.camera = ctx.camera
    this.canvas = ctx.canvas
    this.hitArea = ctx.hitArea
    this.metrics = ctx.metrics
    this.count = ctx.textures.length
    this.maxPosition = this.count
    this.current = clamp(Math.round(ctx.position), 0, Math.max(this.count - 1, 0)) // pages turned

    this.geometry = createSingleGeometry(ctx.settings.pageAspect)
    this.sheets = ctx.textures.map((front, index) => {
      const { mesh, uniforms } = createSingleSheet(this.geometry, front, ctx.blank, ctx.pattern, ctx.settings, ctx.shading)
      this.group.add(mesh)
      return {
        index,
        mesh,
        uniforms,
        progress: index < this.current ? 1 : 0,
        grabX: 1,
        grabXTarget: 1,
        grabY: 0,
        grabYTarget: 0,
        wobble: { tiltDeg: 0, flipTime: 1 },
      }
    })

    // Uneven spacing between rolled pages (some gaps clump together) and an uneven pace
    // for how the roll catches up, both seeded so they look the same every time.
    const P = this.count
    const gaps: number[] = []
    for (let i = 0; i < P - 1; i++) gaps.push(Math.pow(hash(i + 1, ROLL.radiusSpacingSeed), ROLL.radiusSpacingClump))
    const gapSum = gaps.reduce((a, b) => a + b, 0)
    this.radiusSpacing = [0]
    let acc = 0
    for (const g of gaps) {
      acc += 0.1 / gaps.length + 0.9 * (gapSum > 0 ? g / gapSum : 1 / gaps.length)
      this.radiusSpacing.push(acc)
    }
    const steps: number[] = []
    for (let i = 0; i < P; i++) steps.push(Math.pow(hash(i + 1, CATCH_UP.seed + 0.5), CATCH_UP.clump))
    const stepSum = steps.reduce((a, b) => a + b, 0)
    this.catchUp = [0]
    acc = 0
    for (const s of steps) {
      acc += stepSum > 0 ? (s / stepSum) * P : 1
      this.catchUp.push(acc)
    }

    this.bindInput()
  }

  get position() {
    return this.current
  }

  readonly activeSide = 'both'

  setPageTexture(page: number, texture: THREE.Texture) {
    const sheet = this.sheets[page]
    if (!sheet) return
    sheet.uniforms.uFront.value = texture
    this.dirty = true
  }

  dispose() {
    this.cancelHold()
    this.abort.abort()
    for (const sheet of this.sheets) disposeSheetMesh(sheet.mesh)
    this.geometry.dispose()
  }

  // --- helpers ----------------------------------------------------------------

  private randomWobble(): Wobble {
    if (!this.settings.motion.jitter) return { tiltDeg: 0, flipTime: 1 }
    return {
      tiltDeg: THREE.MathUtils.lerp(-WOBBLE.tiltDeg, WOBBLE.tiltDeg, Math.random()),
      flipTime: THREE.MathUtils.lerp(WOBBLE.flipTimeMin, WOBBLE.flipTimeMax, Math.random()),
    }
  }

  private seconds(time: number) {
    return time / this.settings.motion.speed
  }

  // pile lift for a sheet this many pages below the top
  private pileHeight(depth: number) {
    return (this.liftHeight / (1 + depth * PILE.liftDepthFalloff)) * (1 - 0.002 * depth)
  }

  // A bulged page is longer than it is wide; squeeze it so its arc stays one page long.
  private pileReach(height: number) {
    if (height <= 1e-6) return 1
    const curve = (x: number) => {
      const t = 1 - Math.min(x / PILE.liftPeakX, 1)
      return height * Math.sqrt(1 - t * t) * (1 - PILE.liftEdgeDrop * smooth((x - PILE.liftPeakX) / (1 - PILE.liftPeakX)))
    }
    let length = 0
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) ** 2
      const b = ((i + 1) / 6) ** 2
      length += Math.hypot(b - a, curve(b) - curve(a))
    }
    return Math.max(2 - length, 0.5)
  }

  // turned pages, reshaped by the uneven catch-up pace
  private paced(turned: number) {
    const i = Math.min(Math.floor(turned), this.count)
    if (i >= this.count) return this.count
    return this.catchUp[i] + (this.catchUp[i + 1] - this.catchUp[i]) * (turned - i)
  }

  // 0..1 while the last page is turning
  private closing(turned: number) {
    return clamp(turned - (this.count - 1), 0, 1)
  }

  private shutting(turned: number) {
    return smooth((this.closing(turned) - 0.6) / 0.4)
  }

  private inFlight(sheet: Sheet) {
    return this.flights.some((f) => f.sheet === sheet)
  }

  private busy(sheet: Sheet) {
    return this.inFlight(sheet) || this.drag?.sheet === sheet
  }

  // floor point under the pointer, relative to the book
  private floorPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.floor.constant = -this.group.position.z
    const hit = this.raycaster.ray.intersectPlane(this.floor, this.hit)
    return hit ? { x: hit.x - this.group.position.x, y: hit.y - this.group.position.y } : null
  }

  // where on the page the hand is, steering how the page tilts as it turns
  private grab(sheet: Sheet, point: { x: number; y: number } | null, snap: boolean) {
    if (!point) return
    sheet.grabXTarget = Math.min(Math.abs(point.x), 1)
    sheet.grabYTarget = clamp(point.y / this.halfHeight, -1, 1)
    if (snap) {
      sheet.grabX = sheet.grabXTarget
      sheet.grabY = sheet.grabYTarget
    }
  }

  // the last page only turns when the magazine loops back to the cover
  private canTurn(forward: boolean) {
    if (!forward) return this.current > 0
    return this.current < (this.settings.loop ? this.count : this.count - 1)
  }

  // which page a press at this x would pick up: right of the spine turns forward
  private sheetAt(clientX: number) {
    const rect = this.canvas.getBoundingClientRect()
    const spineX = this.spine.copy(this.group.position).project(this.camera).x
    const forward = clientX >= rect.left + (0.5 * spineX + 0.5) * rect.width
    if (!this.canTurn(forward)) return null
    return { sheet: this.sheets[forward ? this.current : this.current - 1], forward }
  }

  // moves the turned count when a page is sent one way or the other
  private commit(forward: boolean, toProgress: number) {
    if (forward && toProgress === 1) this.current++
    else if (!forward && toProgress === 0) this.current--
    this.dirty = true
  }

  private fly(sheet: Sheet, forward: boolean, toProgress: number, flipTime = CLICK.flipTime) {
    this.commit(forward, toProgress)
    const from = sheet.progress
    this.flights = this.flights.filter((f) => f.sheet !== sheet)
    this.flights.push({
      sheet,
      from,
      to: toProgress,
      start: performance.now(),
      duration: 1000 * this.seconds(flipTime) * sheet.wobble.flipTime * Math.max(0.2, Math.abs(toProgress - from)),
    })
  }

  flip(forward: boolean) {
    if (!this.canTurn(forward)) return false
    const sheet = this.sheets[forward ? this.current : this.current - 1]
    if (this.drag?.sheet === sheet) return false
    if (!this.inFlight(sheet)) sheet.wobble = this.randomWobble()
    this.fly(sheet, forward, forward ? 1 : 0)
    return true
  }

  jumpTo(position: number) {
    this.cancelHold()
    this.drag = null
    this.flights = []
    this.current = clamp(Math.round(position), 0, Math.max(this.count - 1, 0))
    for (const sheet of this.sheets) sheet.progress = sheet.index < this.current ? 1 : 0
    this.dirty = true
  }

  // --- input ------------------------------------------------------------------

  private bindInput() {
    const el = this.hitArea
    const signal = this.abort.signal
    const { interaction } = this.settings

    el.addEventListener(
      'pointermove',
      (e) => {
        if (this.press && e.pointerId !== this.press.id) return
        if (this.hold && this.moved(e, this.hold.fired ? HOLD.moveSlopPx : undefined)) this.cancelHold()
        if (!this.drag || !this.press || !interaction.drag) return
        const dx = e.clientX - this.press.x
        this.drag.progress = clamp(this.drag.base - dx / this.drag.rectWidth / this.settings.motion.dragDistance, 0, 1)
        this.grab(this.drag.sheet, this.floorPoint(e.clientX, e.clientY), false)
        this.dirty = true
      },
      { signal },
    )

    el.addEventListener(
      'pointerdown',
      (e) => {
        // a second finger doesn't take over; a new primary pointer means the old one is gone
        if (this.press && !e.isPrimary) return
        if (e.button !== 0 || !(interaction.drag || interaction.click || interaction.hold)) return
        const target = this.sheetAt(e.clientX)
        if (!target) return
        const sheet = target.sheet
        if (!this.inFlight(sheet)) sheet.wobble = this.randomWobble()
        this.grab(sheet, this.floorPoint(e.clientX, e.clientY), true)
        this.flights = this.flights.filter((f) => f.sheet !== sheet)
        this.press = { id: e.pointerId, x: e.clientX, y: e.clientY }
        this.drag = {
          sheet,
          forward: target.forward,
          base: sheet.progress,
          progress: sheet.progress,
          rectWidth: this.metrics.dragWidth,
          speed: 0,
        }
        this.cancelHold()
        if (interaction.hold) {
          this.hold = {
            forward: target.forward,
            x: e.clientX,
            y: e.clientY,
            count: 0,
            fired: false,
            timer: setTimeout(() => this.holdTick(), 1000 * HOLD.startTime),
          }
        }
        try {
          el.setPointerCapture(e.pointerId)
        } catch {}
        this.dirty = true
      },
      { signal },
    )

    el.addEventListener('pointerup', (e) => this.release(e), { signal })
    el.addEventListener('pointercancel', (e) => this.release(e), { signal })
    el.addEventListener('lostpointercapture', (e) => this.release(e), { signal })

    if (!interaction.drag) return
    // let vertical swipes scroll the page, take over the flatter ones
    el.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0]
        this.touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, claimed: false } : null
      },
      { passive: true, signal },
    )
    el.addEventListener(
      'touchmove',
      (e) => {
        if (!this.touch || e.touches.length !== 1) return
        if (this.touch.claimed) {
          if (e.cancelable) e.preventDefault()
          return
        }
        if (!e.cancelable) {
          this.touch = null
          return
        }
        const t = e.touches[0]
        const dx = Math.abs(t.clientX - this.touch.x)
        const dy = Math.abs(t.clientY - this.touch.y)
        if (dx >= DRAG.claimAfterPx && dy < dx * DRAG.claimSteepness) {
          this.touch.claimed = true
          e.preventDefault()
        }
      },
      { passive: false, signal },
    )
  }

  private moved(e: PointerEvent, slop = DRAG.clickSlopPx) {
    return this.press !== null && (e.clientX - this.press.x) ** 2 + (e.clientY - this.press.y) ** 2 > slop * slop
  }

  private cancelHold() {
    if (this.hold) clearTimeout(this.hold.timer)
    this.hold = null
  }

  // press and hold keeps turning pages, a little faster each time
  private holdTick() {
    const hold = this.hold
    if (!hold) return
    if (!hold.fired) {
      hold.fired = true
      this.drag = null
    }
    if (!this.canTurn(hold.forward)) return this.cancelHold()
    const sheet = this.sheets[hold.forward ? this.current : this.current - 1]
    const ramp = (from: number, to: number) => from + (to - from) * Math.min(hold.count / HOLD.speedUpSheets, 1)
    if (!this.inFlight(sheet)) sheet.wobble = this.randomWobble()
    this.grab(sheet, this.floorPoint(hold.x, hold.y), true)
    const flipTime = ramp(HOLD.firstFlipTime, HOLD.fastestFlipTime)
    this.fly(sheet, hold.forward, hold.forward ? 1 : 0, flipTime)
    hold.count++
    hold.timer = setTimeout(
      () => this.holdTick(),
      1000 * this.seconds(flipTime) * ramp(HOLD.firstGapShare, HOLD.fastestGapShare),
    )
  }

  // pointercancel and lostpointercapture put the page back; only pointerup completes a turn
  private release(e: PointerEvent) {
    if (!this.press || e.pointerId !== this.press.id) return
    const cancelled = e.type !== 'pointerup'
    const wasMoved = this.moved(e)
    this.cancelHold()
    const drag = this.drag
    this.drag = null
    this.press = null
    try {
      this.hitArea.releasePointerCapture(e.pointerId)
    } catch {}
    if (!drag) return
    const { interaction } = this.settings

    // a click turns the page
    if (!wasMoved || !interaction.drag) {
      if (!cancelled && interaction.click) this.fly(drag.sheet, drag.forward, drag.forward ? 1 : 0)
      else this.settleBack(drag)
      return
    }

    let to: number
    if (cancelled) to = drag.forward ? 0 : 1
    else {
      const travelled = drag.forward ? drag.progress - drag.base : drag.base - drag.progress
      to = drag.forward === travelled >= this.settings.motion.commitThreshold ? 1 : 0
    }
    this.commit(drag.forward, to)

    // fall the rest of the way, launched with the speed the hand left it with
    const sheet = drag.sheet
    const speed = to === 1 ? drag.speed : -drag.speed
    const remaining = Math.max(Math.abs(to - sheet.progress), 0.001)
    const duration = this.seconds(DRAG.fallTime) * sheet.wobble.flipTime * Math.pow(remaining, DRAG.fallTimeExponent)
    this.flights = this.flights.filter((f) => f.sheet !== sheet)
    this.flights.push({
      sheet,
      from: sheet.progress,
      to,
      start: performance.now(),
      duration: 1000 * duration,
      launch: clamp((speed * duration) / remaining, 0, 2),
    })
  }

  // a press that didn't turn anything: put the page back where it was
  private settleBack(drag: Drag) {
    const to = drag.forward ? 0 : 1
    if (drag.sheet.progress === to) return
    this.flights.push({ sheet: drag.sheet, from: drag.sheet.progress, to, start: performance.now(), duration: 300 })
  }

  // --- simulation ---------------------------------------------------------------

  update(now: number) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]
      const t = clamp((now - f.start) / f.duration, 0, 1)
      let k: number
      if (f.launch === undefined) {
        k = 0.5 * (1 - Math.cos((1 - Math.pow(1 - t, CLICK.settlePower)) * Math.PI))
      } else {
        // hermite: leaves with the hand's speed, lands at rest
        const t2 = t * t
        const t3 = t2 * t
        k = (t3 - 2 * t2 + t) * f.launch + (3 * t2 - 2 * t3)
      }
      f.sheet.progress = f.from + (f.to - f.from) * k
      if (now >= f.start + f.duration) {
        this.flights.splice(i, 1)
        this.dirty = true
      }
    }

    // read to the end: everything has settled flat, start over from the cover
    if (this.count && this.current >= this.count && !this.flights.length && !this.drag) {
      this.current = 0
      for (const sheet of this.sheets) sheet.progress = 0
      this.dirty = true
    }

    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60
    this.last = now

    if (this.drag) {
      const sheet = this.drag.sheet
      const step = (this.drag.progress - sheet.progress) * (1 - Math.pow(0.01, dt / DRAG.progressSmoothTime))
      sheet.progress += step
      this.drag.speed = dt > 0 ? step / dt : 0
    }

    let moving = this.flights.length > 0 || this.drag !== null
    const grabStep = 1 - Math.pow(0.001, dt / GRAB.smoothTime)
    for (const sheet of this.sheets) {
      for (const key of ['grabX', 'grabY'] as const) {
        const target = key === 'grabX' ? sheet.grabXTarget : sheet.grabYTarget
        const d = target - sheet[key]
        if (Math.abs(d) < 1e-4) sheet[key] = target
        else {
          sheet[key] += d * grabStep
          moving = true
        }
      }
      if (!this.busy(sheet)) {
        const rest = sheet.index < this.current ? 1 : 0
        if (sheet.progress !== rest) {
          sheet.progress = rest
          this.dirty = true
        }
      }
    }

    if (!moving && !this.dirty) return false

    let turned = 0
    for (const sheet of this.sheets) turned += sheet.progress
    for (const sheet of this.sheets) this.applyUniforms(sheet, turned)

    const closing = this.closing(turned) > 0
    for (const sheet of this.sheets) {
      const i = sheet.index
      sheet.mesh.visible = closing || i <= this.current + PILE.renderDepth || this.busy(sheet)
      layerSheet(sheet.mesh, i < this.current ? this.current - 1 - i : i - this.current, this.count, this.busy(sheet))
    }

    // the book eases back and to the right as the read pages pile up behind it
    const read = smooth(this.count > 1 ? this.paced(turned) / (this.count - 1) : 0) * (1 - this.shutting(turned))
    this.group.position.x = BOOK.pushRight * read
    this.group.position.z = -BOOK.pushBack * read

    this.dirty = false
    return true
  }

  private applyUniforms(sheet: Sheet, turned: number) {
    const u = sheet.uniforms
    const P = this.count
    const T = sheet.progress
    const paced = this.paced(turned)

    // how far read pages swing round before rolling; it opens up as you read on
    const openFraction = Math.min(paced / Math.max(1, P - 1), 1)
    const spineOpen =
      ((ROLL.spineOpenStartDeg +
        (ROLL.spineOpenEndDeg - ROLL.spineOpenStartDeg) * Math.pow(openFraction, ROLL.spineOpenPower)) *
        Math.PI) /
      180
    const shut = this.shutting(turned)
    const closed = this.closing(turned) >= 1 ? 1 : 0
    const fall = Math.max(
      smooth((paced - (sheet.index + 1) - ROLL.fallDelayPages) / Math.max(ROLL.fallDurationPages, 0.001)),
      shut,
    )

    // cone radii: the further back in the roll, the wider; it evens out as the roll fills
    const spacing = this.radiusSpacing[sheet.index] ?? 0
    const topR = ROLL.coverTopRadius + (ROLL.backTopRadius - ROLL.coverTopRadius) * spacing
    const bottomR = ROLL.coverBottomRadius + (ROLL.backBottomRadius - ROLL.coverBottomRadius) * spacing
    const even = Math.pow(P ? Math.min(paced / P, 1) : 0, ROLL.coneEvenPower)
    const midR = (topR + bottomR) / 2
    const radii = {
      top: (topR + (midR - topR) * even) * (1 - fall),
      bottom: (bottomR + (midR - bottomR) * even) * (1 - fall),
    }

    // pile bulge
    const fallen = fall >= 1
    const readShare = P ? paced / P : 0
    const depth = fallen ? Math.max(0, P - turned) + sheet.index : Math.max(0, sheet.index - turned)
    const presence = fallen
      ? Math.max(smooth(paced - (sheet.index + 1) - ROLL.fallDelayPages - ROLL.fallDurationPages), closed)
      : (1 - T) * (1 - shut)
    const share = PILE.liftShutShare + (1 - PILE.liftShutShare) * readShare
    const open = this.pileHeight(depth) * (fallen ? PILE.liftShutShare : share)
    const lift = (open + (this.pileHeight(sheet.index) * PILE.liftShutShare - open) * shut) * presence
    u.uPileLift.value.set(PILE.liftPeakX, lift, PILE.liftEdgeDrop)
    const topShare = share + (PILE.liftShutShare - share) * shut
    const reference = Math.max(this.pileHeight(0) * Math.max(topShare, 0.001), 1e-6)
    u.uConeTaper.value = (PILE.coneTaper * lift) / reference

    // hold a page high and to the side and it turns tilted
    const reachFade = 1 - 0.5 * Math.max(sheet.grabY, 0) * sheet.grabX
    const tiltDeg = sheet.grabY * (0.5 + 0.5 * sheet.grabX) * this.settings.motion.maxTilt + sheet.wobble.tiltDeg

    if (fallen) {
      u.uCone.value.set(0, 1, 0)
      u.uTailBend.value = 0
      const angle = TAU * T
      u.uFlipRotation.value.set(Math.cos(angle), Math.sin(angle))
    } else {
      this.shapeTurn(sheet, T, spineOpen, radii, (tiltDeg * reachFade * Math.PI) / 180)
    }

    const height = u.uPileLift.value.y
    const taper = u.uConeTaper.value
    u.uPileReach.value.set(this.pileReach(height * (1 - 0.5 * taper)), this.pileReach(height * (1 + 0.5 * taper)))
  }

  // a turning page: swing round the spine up to the open angle, then roll round the cone
  private shapeTurn(sheet: Sheet, T: number, spineOpen: number, radii: { top: number; bottom: number }, tilt: number) {
    const u = sheet.uniforms
    const half = this.halfHeight
    const aspect = this.settings.pageAspect
    const curl = this.settings.motion.curl
    const lead = TAU * (1 - Math.pow(1 - T, SHAPE.midLeadPower))
    const even = TAU * T
    const swing = Math.min(lead, spineOpen)
    const wrap = lead - swing
    const wrapShare = wrap / Math.max(TAU - spineOpen, 0.001)
    // start the roll loose and tighten it as the page goes round
    const rollScale = 1 + (SHAPE.midRollScale - 1) * (1 - smooth(wrapShare))
    const topRadius = Math.max(radii.top * rollScale, 1e-4)
    const spread = clamp((radii.bottom * rollScale - topRadius) / aspect, -0.999, 0.999)

    // length of page taken up by the roll at height y
    const rolled = (y: number) => {
      const r = Math.max(1e-5, topRadius + (half - y) * spread)
      const a = clamp(spread * wrap, -1.5, 1.5)
      return Math.abs(spread) < 1e-4 ? r * wrap : (r * Math.tan(a)) / spread
    }
    // the free edge lines up with the roll as the page goes round
    const angle = tilt + (Math.atan2(rolled(-half) - rolled(half), aspect) - tilt) * smooth(T)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const curlStart = Math.max(rolled(half) * cos + half * sin, rolled(-half) * cos - half * sin)
    const curlLength = cos + half * Math.abs(sin) - curlStart

    // the pile bulge lets go as the page leaves it
    const letGo = 1 - smooth(lead / spineOpen)
    u.uPileLift.value.y *= letGo
    u.uConeTaper.value *= letGo
    u.uCone.value.set(spread, topRadius, wrap)
    u.uTailCurl.value.set(cos, sin, curlStart, Math.max(curlLength, 0.001))

    // mid-turn the free end bows back behind the roll
    const flat = 1 - smooth((T - SHAPE.midBowFlatFrom) / (SHAPE.midBowFlatTo - SHAPE.midBowFlatFrom))
    u.uTailBend.value = Math.max(SHAPE.midBow * curl * flat * Math.min(even - lead, 0), -lead)
    u.uFlipRotation.value.set(Math.cos(swing), Math.sin(swing))
  }
}
