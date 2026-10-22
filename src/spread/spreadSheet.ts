import * as THREE from 'three'
import type { ResolvedSettings } from '../options.js'
import { createSheetMesh, type SheetMesh, type SheetShading, type SheetUniforms } from '../paper/paperMaterial.js'

// A spread sheet is a 1 × pageAspect plane. Its flat coordinates come from the uv: x runs
// from the spine (0) to the outer edge (1), y is centred on the spine's midpoint.
const NORMAL_EPSILON = 0.03
const WRINKLE_SCALE = 1.2
const WRINKLE_SEED = 46

const vertexChunk = (settings: ResolvedSettings) => /* glsl */ `
  // resting bulge across the page: up off the spine, a slight dip, up again, down at the edge
  const float LIFT_MAX_X = 0.14;
  const float LIFT_MAX_Z = 0.04;
  const float LIFT_DIP_X = 0.58;
  const float LIFT_DIP_Z = 0.035;
  const float LIFT_MID_X = 0.72;
  const float LIFT_MID_Z = 0.04;
  const float LIFT_EDGE_Z = 0.03;

  const float BULGE = ${settings.paper.bulge.toFixed(4)};
  const float WRINKLE = ${(0.13 * settings.paper.wrinkles).toFixed(4)};

  uniform float uFlipProgress;
  uniform float uWrinkleSide;
  uniform float uBendAngle;
  uniform vec2 uFold;
  uniform vec2 uCurl;
  uniform vec2 uFlipRotation;
  uniform float uDirection;
  uniform float uStackLift;

  attribute vec3 aNoise;

  float sheetRestingLift(float x) {
    if (x <= LIFT_MAX_X) return LIFT_MAX_Z * sin(x / LIFT_MAX_X * 1.57079633);
    if (x <= LIFT_DIP_X) return mix(LIFT_MAX_Z, LIFT_DIP_Z, smoothstep(LIFT_MAX_X, LIFT_DIP_X, x));
    if (x <= LIFT_MID_X) return mix(LIFT_DIP_Z, LIFT_MID_Z, smoothstep(LIFT_DIP_X, LIFT_MID_X, x));
    float t = (x - LIFT_MID_X) / (1.0 - LIFT_MID_X);
    return mix(LIFT_MID_Z, LIFT_EDGE_Z, 1.0 - cos(t * 1.57079633));
  }

  vec3 sheetPosition(vec2 uv, float noise) {
    float x = uv.x;
    float y = (uv.y - 0.5) * SHEET_ASPECT;

    // Every sheet shares the same wrinkles and bulge, scaled by its place in the stack,
    // so stacked sheets nest inside each other instead of crossing.
    float wrinkle = (mix(noise, 1.0 - noise, uFlipProgress) - 0.5) * smoothstep(0.0, 0.35, x) * WRINKLE * uStackLift;
    float lift = sheetRestingLift(x) * BULGE * uStackLift;

    // bend with constant curvature past the fold line, trailing against the turn
    float u = x * uFold.x + y * uFold.y;
    float v = -x * uFold.y + y * uFold.x;
    float beyond = max(0.0, u - uCurl.x);
    float angle = beyond / uCurl.y * uBendAngle;
    float sinc = abs(angle) < 1e-4 ? 1.0 : sin(angle) / angle;
    float versine = abs(angle) < 1e-4 ? 0.0 : (1.0 - cos(angle)) / angle;
    float bentU = u - beyond + beyond * sinc;
    float bentZ = -uDirection * beyond * versine;

    vec3 p = vec3(bentU * uFold.x - v * uFold.y, bentU * uFold.y + v * uFold.x, bentZ);

    // turn about the spine
    p = vec3(p.x * uFlipRotation.x - p.z * uFlipRotation.y, p.y, p.x * uFlipRotation.y + p.z * uFlipRotation.x);

    p.z += lift + uWrinkleSide * wrinkle;
    return p;
  }
`

// fbm value noise, sampled per vertex once (and at the two neighbours used for normals)
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * sx
  const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * sx
  return a + (b - a) * sy
}

function wrinkleNoise(u: number, v: number, aspect: number) {
  let x = u / WRINKLE_SCALE + WRINKLE_SEED * 13.37
  let y = ((v - 0.5) * aspect) / WRINKLE_SCALE + WRINKLE_SEED * 7.77
  let value = 0
  let amplitude = 0.5
  for (let octave = 0; octave < 3; octave++) {
    value += amplitude * valueNoise(x, y)
    amplitude *= 0.5
    x *= 2
    y *= 2
  }
  return value
}

export function createSpreadGeometry(aspect: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, aspect, 64, Math.round(64 * aspect))
  const uv = geometry.attributes.uv
  const noise = new Float32Array(uv.count * 3)
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    noise[i * 3] = wrinkleNoise(u, v, aspect)
    noise[i * 3 + 1] = wrinkleNoise(u + NORMAL_EPSILON, v, aspect)
    noise[i * 3 + 2] = wrinkleNoise(u, v + NORMAL_EPSILON / aspect, aspect)
  }
  geometry.setAttribute('aNoise', new THREE.BufferAttribute(noise, 3))
  return geometry
}

export interface SpreadSheetUniforms extends SheetUniforms {
  uFlipProgress: THREE.IUniform<number>
  uWrinkleSide: THREE.IUniform<number>
  uBendAngle: THREE.IUniform<number>
  uFold: THREE.IUniform<THREE.Vector2>
  uCurl: THREE.IUniform<THREE.Vector2>
  uFlipRotation: THREE.IUniform<THREE.Vector2>
  uDirection: THREE.IUniform<number>
  uStackLift: THREE.IUniform<number>
  uFront: THREE.IUniform<THREE.Texture>
  uBack: THREE.IUniform<THREE.Texture>
  uPattern: THREE.IUniform<THREE.Texture>
  uSpineContact: THREE.IUniform<THREE.Vector3>
  uLightDirection: THREE.IUniform<THREE.Vector3>
}

export function createSpreadSheet(
  geometry: THREE.BufferGeometry,
  front: THREE.Texture,
  back: THREE.Texture,
  pattern: THREE.Texture,
  settings: ResolvedSettings,
  shading: SheetShading,
): { mesh: SheetMesh; uniforms: SpreadSheetUniforms } {
  const uniforms: SpreadSheetUniforms = {
    uFlipProgress: { value: 0 },
    uWrinkleSide: { value: -1 },
    uBendAngle: { value: 0 },
    uFold: { value: new THREE.Vector2(1, 0) },
    uCurl: { value: new THREE.Vector2(0, 1) },
    uFlipRotation: { value: new THREE.Vector2(1, 0) },
    uDirection: { value: 1 },
    uStackLift: { value: 1 },
    uFront: { value: front },
    uBack: { value: back },
    uPattern: { value: pattern },
    uSpineContact: shading.spineContact,
    uLightDirection: shading.lightDirection,
  }
  const mesh = createSheetMesh(
    geometry,
    uniforms,
    { vertexChunk: vertexChunk(settings), epsilon: NORMAL_EPSILON, noise: true, shadowOffsetX: 0.004 },
    settings,
  )
  return { mesh, uniforms }
}
