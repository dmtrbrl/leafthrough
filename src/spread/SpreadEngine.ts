import * as THREE from 'three'
import { floorPoint, type Engine, type EngineContext, type EngineInput, type EngineMetrics } from '../engine.js'
import type { ResolvedSettings } from '../options.js'
import { disposeSheetMesh, layerSheet, type SheetMesh } from '../paper/paperMaterial.js'
import { createSpreadSheet, sharedSpreadGeometry, type SpreadSheetUniforms } from './spreadSheet.js'

const CURVE = {
  arc: 0.88, // share of a half turn the sheet bends by mid-flip
  arcJitter: 0.2,
  angleJitter: 0.3,
  tiltJitterDeg: 6,
  cornerRollMax: 2.3,
  directionSmoothTime: 0.4,
  smoothTime: 0.5,
  settleEpsilon: 1e-4,
}
const HOVER = { smoothTime: 2, gapToSheetAbove: 0.1 }
const HOLD = {
  startTime: 0.22,
  firstFlipTime: 1.2,
  fastestFlipTime: 0.5,
  speedUpSheets: 20,
  firstGapShare: 0.15,
  fastestGapShare: 0.05,
  moveSlopPx: 40,
}
const DRAG = { progressSmoothTime: 0.9, fallTime: 1, fallTimeExponent: 0.5, landingSpeed: 0.5, clickSlopPx: 5 }
const CLICK = { flipTime: 0.85, followArcGainMin: 1, followArcGainMax: 1.08 }

const clamp = THREE.MathUtils.clamp
const approach = (smoothTime: number, dt: number) => 1 - Math.pow(0.001, dt / smoothTime)

interface Curve {
  arc: number
  angleDeg: number
}
interface Wobble {
  arc: number
  angle: number
  tilt: number
}
interface Sheet {
  index: number
  mesh: SheetMesh
  uniforms: SpreadSheetUniforms
  progress: number
  direction: number
  directionSmooth: number
  curve: Curve
  curveTarget: Curve
  wobble: Wobble
  liftBase: number
  liftSpan: number
}
interface Flight {
  index: number
  from: number
  to: number
  direction: number
  start: number
  duration: number
  launch?: number
}
interface Drag {
  index: number
  forward: boolean
  base: number
  progress: number
  rectWidth: number
  targetCurve: Curve
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

// The last sheets of each stack sit lowest. Sheets on top bulge and wrinkle the most.
function stackLift(index: number, count: number, progress: number) {
  if (count <= 1) return 1
  return 0.31 + (0.69 * (index + (count - 1 - 2 * index) * (1 - progress))) / (count - 1)
}

// How many sheets lie under this one: those after it on the right, those before it on the
// left. A turning sheet keeps the height of the pile it leans over, so it stays above every
// sheet there, and changes over while it stands upright, where a height change only slides
// it along itself.
function sheetsUnder(index: number, count: number, progress: number) {
  const t = clamp((progress - 0.25) / 0.5, 0, 1)
  return count - 1 - index + (2 * index - count + 1) * t * t * (3 - 2 * t)
}

/**
 * The open magazine: sheets rotate over the spine, bending as they go. Horizontal drag
 * drives the turn; where the hand is around the spine tilts the fold.
 */
export class SpreadEngine implements Engine {
  readonly group = new THREE.Group()
  readonly maxPosition: number

  private readonly settings: ResolvedSettings
  private readonly halfHeight: number
  private readonly input: EngineInput
  private readonly metrics: EngineMetrics
  private readonly requestFrame: () => void
  private readonly geometry: THREE.BufferGeometry
  private readonly releaseGeometry: () => void
  private readonly sheets: Sheet[]
  private readonly abort = new AbortController()
  private readonly shading: EngineContext['shading']

  private current: number
  private flights: Flight[] = []
  private drag: Drag | null = null
  // the pointer that started the gesture; other pointers are ignored until it lifts
  private press: { id: number; x: number; y: number } | null = null
  private hold: Hold | null = null
  private hover = { active: false, x: 0, y: 0 }
  private hovered = -1
  private leader = -1 // the sheet most recently sent flying
  private dirty = true
  private last = 0

  private readonly ray = new THREE.Ray()
  private readonly hit = new THREE.Vector3()

  constructor(ctx: EngineContext) {
    this.settings = ctx.settings
    this.halfHeight = ctx.settings.pageAspect / 2
    this.input = ctx.input
    this.metrics = ctx.metrics
    this.requestFrame = ctx.requestFrame
    this.shading = ctx.shading

    const count = Math.ceil(ctx.textures.length / 2)
    this.maxPosition = count
    this.current = clamp(Math.round(ctx.position), 0, count)
    const { geometry, release } = sharedSpreadGeometry(ctx.shared, ctx.settings.pageAspect)
    this.geometry = geometry
    this.releaseGeometry = release
    this.sheets = []
    for (let i = 0; i < count; i++) {
      const front = ctx.textures[2 * i]
      const back = ctx.textures[2 * i + 1] ?? ctx.blank
      const { mesh, uniforms } = createSpreadSheet(this.geometry, front, back, ctx.pattern, ctx.settings, ctx.shading)
      this.sheets.push({
        index: i,
        mesh,
        uniforms,
        progress: i < this.current ? 1 : 0,
        direction: 1,
        directionSmooth: 1,
        curve: { arc: 0, angleDeg: 0 },
        curveTarget: { arc: 0, angleDeg: 0 },
        wobble: { arc: 0.5, angle: 0.5, tilt: 0 },
        liftBase: stackLift(i, count, 0),
        liftSpan: stackLift(i, count, 1) - stackLift(i, count, 0),
      })
      this.group.add(mesh)
    }
    this.bindInput()
  }

  get position() {
    return this.current
  }

  get turning() {
    return this.flights.length > 0 || this.drag !== null
  }

  pagesInView() {
    // sheet i carries pages 2i (front) and 2i + 1 (back)
    let from = Math.max(2 * this.current - 1, 0)
    let to = 2 * this.current
    for (const sheet of this.sheets) {
      if (sheet.progress <= 0 || sheet.progress >= 1) continue
      from = Math.min(from, 2 * sheet.index)
      to = Math.max(to, 2 * sheet.index + 1)
    }
    return { from, to }
  }

  // closed, only the cover side can be grabbed
  get activeSide() {
    const busy = this.flights.length > 0 || this.drag !== null || this.hold !== null
    if (busy) return 'both'
    if (this.current === 0) return 'right'
    if (this.current === this.sheets.length) return 'left'
    return 'both'
  }

  setPageTexture(page: number, texture: THREE.Texture) {
    const sheet = this.sheets[page >> 1]
    if (!sheet) return
    if (page % 2 === 0) sheet.uniforms.uFront.value = texture
    else sheet.uniforms.uBack.value = texture
    this.wake()
  }

  cancelInput() {
    this.cancelHold()
    this.hover.active = false
    if (this.press) this.release(new PointerEvent('pointercancel', { pointerId: this.press.id }))
    this.wake()
  }

  setShadows(on: boolean) {
    this.settings.lighting.shadows = on
    for (const sheet of this.sheets) sheet.mesh.receiveShadow = on
    this.wake()
  }

  dispose() {
    this.cancelHold()
    this.abort.abort()
    for (const sheet of this.sheets) disposeSheetMesh(sheet.mesh)
    this.releaseGeometry()
  }

  // --- helpers ----------------------------------------------------------------

  private randomWobble(): Wobble {
    if (!this.settings.motion.jitter) return { arc: 0.5, angle: 0.5, tilt: 0 }
    return { arc: Math.random(), angle: Math.random(), tilt: 2 * Math.random() - 1 }
  }

  private seconds(time: number) {
    return time / this.settings.motion.speed
  }

  // something changed between frames
  private wake() {
    this.dirty = true
    this.requestFrame()
  }

  // the point on the floor under the pointer, the spine at x = 0
  private pointAt(clientX: number, clientY: number) {
    if (!this.input.ray(clientX, clientY, this.ray)) return null
    return floorPoint(this.group, this.ray, this.hit)
  }

  // how far a sheet may bend before its far corner rolls over itself
  private arcLimit(angleDeg: number) {
    const t = (Math.abs(angleDeg) * Math.PI) / 180
    const reach = Math.cos(t) / (1 - this.halfHeight * Math.sin(t))
    return CURVE.cornerRollMax / (Math.PI * reach)
  }

  private restingArc(wobble: Wobble, angleDeg: number) {
    return Math.min(CURVE.arc * this.settings.motion.curl * (1 - wobble.arc * CURVE.arcJitter), this.arcLimit(angleDeg))
  }

  private inFlight(index: number) {
    return this.flights.some((f) => f.index === index)
  }

  // which sheet a press here would pick up
  private sheetAt(clientX: number, clientY: number) {
    const point = this.pointAt(clientX, clientY)
    if (!point) return null
    const forward = point.x >= 0
    if (forward ? this.current >= this.sheets.length : this.current <= 0) return null
    return { index: forward ? this.current : this.current - 1, forward }
  }

  // Where the hand is around the spine shapes the bend: near the top or bottom the fold
  // tilts, and further from the spine it tilts more.
  private curveFor(clientX: number, clientY: number, index: number): Curve {
    const wobble = this.sheets[index].wobble
    const maxTilt = this.settings.motion.maxTilt
    const hit = this.pointAt(clientX, clientY)

    let angleDeg = 0
    if (hit) {
      let deg = (Math.atan2(hit.y, hit.x) * 180) / Math.PI
      if (deg > 90) deg = 180 - deg
      if (deg < -90) deg = -180 - deg
      const jitter = 1 - wobble.angle * CURVE.angleJitter
      angleDeg = clamp(
        -(deg / 90) * maxTilt * Math.hypot(hit.x, hit.y) * jitter + wobble.tilt * CURVE.tiltJitterDeg,
        -maxTilt,
        maxTilt,
      )
    }

    // a sheet following one that's still in the air keeps to the inside of its curve
    const leader = this.sheets[this.leader]
    const following =
      leader &&
      this.leader !== index &&
      this.inFlight(this.leader) &&
      !(leader.direction > 0 ? leader.progress > 0.5 : leader.progress < 0.5)
    if (!following) return { arc: this.restingArc(wobble, angleDeg), angleDeg }

    const lead = leader.curveTarget
    angleDeg = clamp(angleDeg, Math.min(0, lead.angleDeg), Math.max(0, lead.angleDeg))
    const gain = THREE.MathUtils.lerp(CLICK.followArcGainMin, CLICK.followArcGainMax, wobble.arc)
    return { arc: clamp(lead.arc * gain, lead.arc, this.arcLimit(angleDeg)), angleDeg }
  }

  private setCurve(sheet: Sheet, curve: Curve, snap: boolean) {
    sheet.curveTarget.arc = curve.arc
    sheet.curveTarget.angleDeg = curve.angleDeg
    if (snap) {
      sheet.curve.arc = curve.arc
      sheet.curve.angleDeg = curve.angleDeg
    }
  }

  private commit(index: number, toProgress: number) {
    this.leader = index
    this.sheets[index].wobble = this.randomWobble()
    this.current = toProgress === 1 ? index + 1 : index
    this.wake()
  }

  private fly(index: number, forward: boolean, toProgress: number, flipTime = CLICK.flipTime) {
    this.commit(index, toProgress)
    const from = this.sheets[index].progress
    this.flights = this.flights.filter((f) => f.index !== index)
    this.flights.push({
      index,
      from,
      to: toProgress,
      direction: forward ? 1 : -1,
      start: performance.now(),
      duration: 1000 * this.seconds(flipTime) * Math.max(0.2, Math.abs(toProgress - from)),
    })
  }

  flip(forward: boolean) {
    if (forward ? this.current >= this.sheets.length : this.current <= 0) return false
    const index = forward ? this.current : this.current - 1
    if (this.drag?.index === index) return false
    const sheet = this.sheets[index]
    if (!this.inFlight(index)) {
      sheet.wobble = this.randomWobble()
      const angleDeg = sheet.wobble.tilt * CURVE.tiltJitterDeg
      this.setCurve(sheet, { arc: this.restingArc(sheet.wobble, angleDeg), angleDeg }, true)
    }
    sheet.direction = forward ? 1 : -1
    this.fly(index, forward, forward ? 1 : 0)
    return true
  }

  jumpTo(position: number) {
    this.cancelHold()
    this.drag = null
    this.flights = []
    this.current = clamp(Math.round(position), 0, this.sheets.length)
    for (const sheet of this.sheets) {
      sheet.progress = sheet.index < this.current ? 1 : 0
      sheet.direction = sheet.directionSmooth = 1
    }
    this.wake()
  }

  // --- input ------------------------------------------------------------------

  private bindInput() {
    const el = this.input.element
    const signal = this.abort.signal
    const { interaction } = this.settings

    el.addEventListener(
      'pointermove',
      (e) => {
        if (this.press && e.pointerId !== this.press.id) return
        if (this.hold && this.moved(e, this.hold.fired ? HOLD.moveSlopPx : undefined)) this.cancelHold()
        if (this.drag && this.press) {
          if (!interaction.drag) return
          const dx = this.metrics.dragDelta?.(e.clientX - this.press.x, e.clientY - this.press.y) ?? e.clientX - this.press.x
          this.drag.progress = clamp(this.drag.base - dx / this.drag.rectWidth / this.settings.motion.dragDistance, 0, 1)
          this.drag.targetCurve = this.curveFor(e.clientX, e.clientY, this.drag.index)
        } else if (e.pointerType === 'mouse') {
          this.hover = { active: this.input.covers(e.clientX, e.clientY), x: e.clientX, y: e.clientY }
        }
        this.wake()
      },
      { signal },
    )

    el.addEventListener(
      'pointerleave',
      () => {
        this.hover.active = false
        this.wake()
      },
      { signal },
    )

    el.addEventListener(
      'pointerdown',
      (e) => {
        // a second finger doesn't take over; a new primary pointer means the old one is gone
        if (this.press && !e.isPrimary) return
        if (e.button !== 0 || !(interaction.drag || interaction.click || interaction.hold)) return
        if (!this.input.covers(e.clientX, e.clientY)) return
        const target = this.sheetAt(e.clientX, e.clientY)
        if (!target) return
        const sheet = this.sheets[target.index]
        if (!this.inFlight(target.index)) this.setCurve(sheet, this.curveFor(e.clientX, e.clientY, target.index), true)
        this.flights = this.flights.filter((f) => f.index !== target.index)
        this.press = { id: e.pointerId, x: e.clientX, y: e.clientY }
        this.drag = {
          index: target.index,
          forward: target.forward,
          base: sheet.progress,
          progress: sheet.progress,
          rectWidth: this.metrics.dragWidth,
          targetCurve: { ...sheet.curveTarget },
          speed: 0,
        }
        sheet.direction = target.forward ? 1 : -1
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
        this.wake()
      },
      { signal },
    )

    el.addEventListener('pointerup', (e) => this.release(e), { signal })
    el.addEventListener('pointercancel', (e) => this.release(e), { signal })
    el.addEventListener('lostpointercapture', (e) => this.release(e), { signal })
  }

  private moved(e: PointerEvent, slop = DRAG.clickSlopPx) {
    return this.press !== null && (e.clientX - this.press.x) ** 2 + (e.clientY - this.press.y) ** 2 > slop * slop
  }

  private cancelHold() {
    if (this.hold) clearTimeout(this.hold.timer)
    this.hold = null
  }

  // press and hold keeps turning pages, faster and faster
  private holdTick() {
    const hold = this.hold
    if (!hold) return
    if (!hold.fired) {
      hold.fired = true
      this.drag = null
    }
    if (hold.forward ? this.current >= this.sheets.length : this.current <= 0) return this.cancelHold()
    const ramp = (from: number, to: number) => from + (to - from) * Math.min(hold.count / HOLD.speedUpSheets, 1)
    const index = hold.forward ? this.current : this.current - 1
    const sheet = this.sheets[index]
    this.setCurve(sheet, hold.count === 0 ? sheet.curveTarget : this.curveFor(hold.x, hold.y, index), true)
    sheet.direction = hold.forward ? 1 : -1
    const flipTime = ramp(HOLD.firstFlipTime, HOLD.fastestFlipTime)
    this.fly(index, hold.forward, hold.forward ? 1 : 0, flipTime)
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
      this.input.element.releasePointerCapture(e.pointerId)
    } catch {}
    this.wake()
    if (!drag) return
    const { interaction } = this.settings

    // a click turns the page
    if (!wasMoved || !interaction.drag) {
      if (!cancelled && interaction.click) this.fly(drag.index, drag.forward, drag.forward ? 1 : 0)
      return
    }

    const travelled = drag.forward ? drag.progress - drag.base : drag.base - drag.progress
    const committed = !cancelled && travelled >= this.settings.motion.commitThreshold
    const to = drag.forward === committed ? 1 : 0
    this.commit(drag.index, to)

    // fall the rest of the way, launched with the speed the hand left it with
    const sheet = this.sheets[drag.index]
    const speed = to === 1 ? drag.speed : -drag.speed
    const remaining = Math.max(Math.abs(to - sheet.progress), 0.001)
    const duration = this.seconds(DRAG.fallTime) * Math.pow(remaining, DRAG.fallTimeExponent)
    this.flights = this.flights.filter((f) => f.index !== drag.index)
    this.flights.push({
      index: drag.index,
      from: sheet.progress,
      to,
      direction: drag.forward ? 1 : -1,
      start: performance.now(),
      duration: 1000 * duration,
      launch: clamp((speed * duration) / remaining, 0, 2),
    })
  }

  // --- simulation ---------------------------------------------------------------

  update(now: number) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]
      const sheet = this.sheets[f.index]
      const t = clamp((now - f.start) / f.duration, 0, 1)
      let k: number
      if (f.launch === undefined) {
        k = 0.5 * (1 - Math.cos(t * Math.PI))
      } else {
        // hermite: leaves with the hand's speed, lands softly
        const t2 = t * t
        const t3 = t2 * t
        k = (t3 - 2 * t2 + t) * f.launch + (3 * t2 - 2 * t3) + (t3 - t2) * DRAG.landingSpeed
      }
      sheet.progress = f.from + (f.to - f.from) * k
      sheet.direction = f.direction
      if (now >= f.start + f.duration) {
        this.flights.splice(i, 1)
        this.dirty = true
      }
    }

    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60
    this.last = now

    let moving = this.flights.length > 0 || this.drag !== null

    if (this.drag) {
      const sheet = this.sheets[this.drag.index]
      const step = (this.drag.progress - sheet.progress) * (1 - Math.pow(0.01, dt / DRAG.progressSmoothTime))
      sheet.progress += step
      this.drag.speed = dt > 0 ? step / dt : 0
      this.setCurve(sheet, this.drag.targetCurve, false)
    }

    // hovering lifts the top sheet a touch
    const { hoverLift } = this.settings.motion
    const previous = this.hovered
    const canHover = this.settings.interaction.hover && hoverLift > 0
    const target = canHover && this.hover.active && !this.drag && !this.hold ? this.sheetAt(this.hover.x, this.hover.y) : null
    this.hovered = target && !this.inFlight(target.index) ? target.index : -1
    if (this.hovered !== -1) {
      const sheet = this.sheets[this.hovered]
      this.setCurve(sheet, this.curveFor(this.hover.x, this.hover.y, this.hovered), this.hovered !== previous)
    }

    const toward = approach(HOVER.smoothTime, dt)
    const directionStep = approach(CURVE.directionSmoothTime, dt)
    const curveStep = approach(CURVE.smoothTime, dt)

    for (const sheet of this.sheets) {
      const i = sheet.index
      if (!this.inFlight(i) && this.drag?.index !== i) {
        const rest = i >= this.current ? 0 : 1
        const goal = i === this.hovered ? Math.abs(rest - hoverLift) : rest
        const diff = goal - sheet.progress
        if (Math.abs(diff) < CURVE.settleEpsilon) {
          if (sheet.progress !== goal) {
            sheet.progress = goal
            this.dirty = true
          }
        } else {
          sheet.progress += diff * toward
          moving = true
        }

        // never get ahead of the sheet lying on top of this one
        const above = this.sheets[rest === 0 ? i - 1 : i + 1]
        if (above) {
          const bounded =
            rest === 0
              ? Math.min(sheet.progress, Math.max(0, above.progress - HOVER.gapToSheetAbove))
              : Math.max(sheet.progress, Math.min(1, above.progress + HOVER.gapToSheetAbove))
          if (bounded !== sheet.progress) {
            sheet.progress = bounded
            moving = true
          }
        }
        sheet.direction = rest === 1 && sheet.progress !== rest ? -1 : 1
        sheet.directionSmooth = sheet.direction
      }

      const dd = sheet.direction - sheet.directionSmooth
      if (Math.abs(dd) < CURVE.settleEpsilon) {
        if (sheet.directionSmooth !== sheet.direction) {
          sheet.directionSmooth = sheet.direction
          this.dirty = true
        }
      } else {
        sheet.directionSmooth += dd * directionStep
        moving = true
      }

      for (const key of ['arc', 'angleDeg'] as const) {
        const d = sheet.curveTarget[key] - sheet.curve[key]
        if (Math.abs(d) < CURVE.settleEpsilon) sheet.curve[key] = sheet.curveTarget[key]
        else {
          sheet.curve[key] += d * curveStep
          moving = true
        }
      }

      this.applyUniforms(sheet)
    }

    if (!moving && !this.dirty) return false
    // the turning sheet standing most upright at the spine casts the contact shadow
    let contact: Sheet | null = null
    let upright = 0
    for (const sheet of this.sheets) {
      const i = sheet.index
      const depth = i >= this.current ? i - this.current : this.current - 1 - i
      const turning = this.inFlight(i) || this.drag?.index === i
      sheet.mesh.castShadow = this.settings.lighting.shadows && (depth < 3 || turning)
      layerSheet(sheet.mesh, depth, this.sheets.length, turning, this.settings.paper.depthBias)
      const lift = Math.abs(sheet.uniforms.uFlipRotation.value.y)
      if (turning && lift > upright) {
        upright = lift
        contact = sheet
      }
    }
    const rotation = contact?.uniforms.uFlipRotation.value
    if (rotation) this.shading.spineContact.value.set(rotation.x, rotation.y, 1)
    else this.shading.spineContact.value.set(1, 0, 0)
    this.dirty = false
    return true
  }

  private applyUniforms(sheet: Sheet) {
    const u = sheet.uniforms
    const half = this.halfHeight
    const turn = sheet.progress * Math.PI
    const bend = Math.sin(turn) * Math.PI * sheet.curve.arc
    const tilt = (sheet.curve.angleDeg * Math.PI) / 180
    const cos = Math.cos(tilt)
    const sin = Math.sin(tilt)
    // the bend line always passes through a corner of the spine, so the spine never folds
    const curlLength = 1 - half * Math.sin(Math.abs(tilt))
    const curlStart = 1 - curlLength
    const reach = Math.max(0, cos + sin * half * Math.sign(sin) - curlStart)
    const tipAngle = (reach / curlLength) * bend
    const tipLift = reach * (Math.abs(tipAngle) < 1e-4 ? 0 : (1 - Math.cos(tipAngle)) / tipAngle)
    // turn a little further to make up for the trailing bend
    const rotation = turn + 0.5 * sheet.directionSmooth * tipLift

    u.uFlipProgress.value = sheet.progress
    u.uWrinkleSide.value = -Math.cos(turn)
    u.uDirection.value = sheet.directionSmooth
    u.uStackLift.value = sheet.liftBase + sheet.liftSpan * sheet.progress
    u.uStackGap.value = this.settings.paper.sheetGap * sheetsUnder(sheet.index, this.sheets.length, sheet.progress)
    u.uBendAngle.value = bend
    u.uFold.value.set(cos, sin)
    u.uCurl.value.set(curlStart, curlLength)
    u.uFlipRotation.value.set(Math.cos(rotation), Math.sin(rotation))
  }
}
