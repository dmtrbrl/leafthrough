import * as THREE from 'three'
import type { ResolvedSettings } from '../options.js'
import { createSheetMesh, type SheetMesh, type SheetUniforms } from '../paper/paperMaterial.js'

// Single-layout sheet: one page per sheet, printed on the front only. Pages that have been
// read don't land on a left stack; they swing around the spine and roll up around a cone
// behind the magazine, like a magazine folded back on itself.
const NORMAL_EPSILON = 0.02

const vertexChunk = /* glsl */ `
  uniform vec3 uPileLift; // x: where the bulge peaks, y: its height, z: how much it drops at the edge
  uniform float uConeTaper; // bulge difference between top and bottom of the pile
  uniform vec2 uPileReach; // horizontal squeeze at the top/bottom so the bulged page keeps its length
  uniform vec4 uTailCurl; // fold direction (cos, sin), where the curl starts, curl length
  uniform float uTailBend; // how far the free end bows back
  uniform vec3 uCone; // radius change per unit of y, radius at the top, how far to wrap
  uniform vec2 uFlipRotation;

  float sheetPileLift(float x) {
    float t = 1.0 - min(x / uPileLift.x, 1.0);
    float fall = uPileLift.z * smoothstep(uPileLift.x, 1.0, x);
    return uPileLift.y * sqrt(1.0 - t * t) * (1.0 - fall);
  }

  // Roll a flat point around a cone whose axis is the spine. The radius grows from the
  // top of the page to the bottom (spread), so pages roll up tighter at one end.
  vec3 sheetConeWrap(float x, float y, float spread, float topRadius, float maxWrap) {
    float apexY = SHEET_ASPECT * 0.5;
    float rowRadius = max(1e-5, topRadius + (apexY - y) * spread);
    float cosCone = sqrt(max(0.0, 1.0 - spread * spread));

    float slant = x * spread / rowRadius;
    float lean = abs(slant) < 1e-3 ? 1.0 - slant * slant / 3.0 : atan(slant) / slant;
    float wrap = (x / rowRadius) * lean;

    if (wrap <= maxWrap) {
      float reach = length(vec2(rowRadius, x * spread));
      return vec3(
        reach * sin(wrap),
        y + spread * (reach * (1.0 - cos(wrap)) - x * x / (rowRadius + reach)),
        reach * cosCone * (1.0 - cos(wrap))
      );
    }

    // past the wrap angle the sheet leaves the cone and carries on straight
    float fan = spread * maxWrap;
    float fanSin = abs(fan) < 1e-3 ? 1.0 - fan * fan / 6.0 : sin(fan) / fan;
    float fanVers = abs(fan) < 1e-3 ? fan * (0.5 - fan * fan / 24.0) : (1.0 - cos(fan)) / fan;

    float along = x * spread * sin(fan) + rowRadius * cos(fan);
    float past = x * cos(fan) - rowRadius * maxWrap * fanSin;
    float lift = along * (1.0 - cos(maxWrap)) + past * sin(maxWrap);

    return vec3(
      along * sin(maxWrap) + past * cos(maxWrap),
      y + rowRadius * maxWrap * fanVers - x * sin(fan) + spread * lift,
      cosCone * lift
    );
  }

  vec3 sheetShape(float x, float y) {
    return sheetConeWrap(x, y, uCone.x, uCone.y, uCone.z);
  }

  // the unread pile bulges up off the spine
  vec3 sheetPile(float u, float y) {
    float row = y / SHEET_ASPECT;
    float taper = 1.0 + uConeTaper * row;
    float x = u * mix(uPileReach.x, uPileReach.y, row + 0.5);
    return vec3(x, y, sheetPileLift(x) * taper);
  }

  // the free end of a turning page bows back past the roll
  vec3 sheetTailCurl(vec2 p) {
    float cosTilt = uTailCurl.x;
    float sinTilt = uTailCurl.y;
    float along = p.x * cosTilt + p.y * sinTilt;
    float across = -p.x * sinTilt + p.y * cosTilt;
    float beyond = max(0.0, along - uTailCurl.z);
    float angle = beyond / uTailCurl.w * uTailBend;
    float sinc = abs(angle) < 1e-4 ? 1.0 : sin(angle) / angle;
    float versine = abs(angle) < 1e-4 ? 0.0 : (1.0 - cos(angle)) / angle;
    float curledAlong = along - beyond + beyond * sinc;
    return vec3(
      curledAlong * cosTilt - across * sinTilt,
      curledAlong * sinTilt + across * cosTilt,
      beyond * versine
    );
  }

  vec3 sheetPosition(vec2 uv, float noise) {
    vec3 pile = sheetPile(uv.x, (uv.y - 0.5) * SHEET_ASPECT);
    vec3 curled = sheetTailCurl(pile.xy);
    vec3 shape = sheetShape(curled.x, curled.y);
    // the curl lifts off the cone surface, along its normal
    if (curled.z != 0.0) {
      vec3 alongX = sheetShape(curled.x + 1e-3, curled.y) - shape;
      vec3 alongY = sheetShape(curled.x, curled.y + 1e-3) - shape;
      shape += normalize(cross(alongX, alongY)) * curled.z;
    }

    // spin about the spine
    float z = shape.z + pile.z;
    return vec3(
      shape.x * uFlipRotation.x - z * uFlipRotation.y,
      shape.y,
      shape.x * uFlipRotation.y + z * uFlipRotation.x
    );
  }
`

export function createSingleGeometry(aspect: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, aspect, 64, Math.round(64 * aspect))
}

export interface SingleSheetUniforms extends SheetUniforms {
  uPileLift: THREE.IUniform<THREE.Vector3>
  uPileReach: THREE.IUniform<THREE.Vector2>
  uConeTaper: THREE.IUniform<number>
  uTailCurl: THREE.IUniform<THREE.Vector4>
  uTailBend: THREE.IUniform<number>
  uCone: THREE.IUniform<THREE.Vector3>
  uFlipRotation: THREE.IUniform<THREE.Vector2>
  uFront: THREE.IUniform<THREE.Texture>
  uBack: THREE.IUniform<THREE.Texture>
  uPattern: THREE.IUniform<THREE.Texture>
}

export function createSingleSheet(
  geometry: THREE.BufferGeometry,
  front: THREE.Texture,
  back: THREE.Texture,
  pattern: THREE.Texture,
  settings: ResolvedSettings,
): { mesh: SheetMesh; uniforms: SingleSheetUniforms } {
  const uniforms: SingleSheetUniforms = {
    uPileLift: { value: new THREE.Vector3(1, 0, 0) },
    uPileReach: { value: new THREE.Vector2(1, 1) },
    uConeTaper: { value: 0 },
    uTailCurl: { value: new THREE.Vector4(1, 0, 1, 1) },
    uTailBend: { value: 0 },
    uCone: { value: new THREE.Vector3(0, 1, 0) },
    uFlipRotation: { value: new THREE.Vector2(1, 0) },
    uFront: { value: front },
    uBack: { value: back },
    uPattern: { value: pattern },
  }
  const mesh = createSheetMesh(
    geometry,
    uniforms,
    { vertexChunk, epsilon: NORMAL_EPSILON, shadowOffsetX: -0.004 },
    settings,
  )
  return { mesh, uniforms }
}
