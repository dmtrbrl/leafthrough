import * as THREE from 'three'
import type { ResolvedSettings } from '../options.js'

export type SheetUniforms = Record<string, THREE.IUniform>

/** Uniforms every sheet in a scene shares. */
export interface SheetShading {
  /** Direction across of the turning sheet's root (x, z) and whether one is turning. */
  spineContact: THREE.IUniform<THREE.Vector3>
  /** Towards the sun, in the magazine's frame. */
  lightDirection: THREE.IUniform<THREE.Vector3>
}

export interface SheetShader {
  /** GLSL defining `vec3 sheetPosition(vec2 uv, float noise)` and its uniforms. */
  vertexChunk: string
  /** GLSL defining `bool sheetHidden(vec3 p)` and its uniforms: true where not to draw. */
  fragmentChunk?: string
  /** Finite difference step for normals, in page widths. */
  epsilon: number
  /** Read per-vertex noise from the `aNoise` attribute (declared by the chunk). */
  noise?: boolean
  /** Nudges the shadow caster sideways. */
  shadowOffsetX: number
}

const glslFloat = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`)

// Both layouts draw sheets the same way: a double-sided MeshStandardMaterial whose vertex
// shader moves each vertex with the layout's sheetPosition(), normals from finite
// differences, and the same printed-paper look in the fragment shader.
function createPaperMaterials(uniforms: SheetUniforms, shader: SheetShader, settings: ResolvedSettings) {
  const { paper, pageAspect } = settings
  // in the working (linear) colour space, like the sampled page images
  const blank = new THREE.Color(paper.backColor)
  const constants = /* glsl */ `
    const float SHEET_ASPECT = ${glslFloat(pageAspect)};
    const float NORMAL_EPSILON = ${glslFloat(shader.epsilon)};
    const float PATTERN_SIZE = ${glslFloat(paper.grainScale)};
    const float PATTERN_DARKEN = ${glslFloat(paper.grain === false ? 0 : paper.grainStrength)};
    const float PATTERN_ROUGHNESS = 0.33;
    const float SHOW_THROUGH = ${glslFloat(paper.showThrough)};
    const float INK_GLOSS = ${glslFloat(paper.inkGloss)};
    const float SHADOW_OFFSET_X = ${glslFloat(shader.shadowOffsetX)};
    const float CONTACT_REACH = 0.04;
    const vec3 BLANK_PAPER = vec3(${glslFloat(blank.r)}, ${glslFloat(blank.g)}, ${glslFloat(blank.b)});
  `
  const noiseAt = (component: string) => (shader.noise ? `aNoise.${component}` : '0.0')

  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    metalness: paper.metalness,
    roughness: paper.roughness,
  })

  material.onBeforeCompile = (program) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader =
      constants + shader.vertexChunk + 'varying vec2 vSheetUv;\nvarying vec3 vSheetPosition;\n' + program.vertexShader
    program.vertexShader = program.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vec2 sheetStep = vec2(NORMAL_EPSILON, NORMAL_EPSILON / SHEET_ASPECT);
        vec3 sheetP = sheetPosition(uv, ${noiseAt('x')});
        vec3 sheetPx = sheetPosition(uv + vec2(sheetStep.x, 0.0), ${noiseAt('y')});
        vec3 sheetPy = sheetPosition(uv + vec2(0.0, sheetStep.y), ${noiseAt('z')});
        objectNormal = normalize(cross(sheetPx - sheetP, sheetPy - sheetP));`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = sheetP;
        vSheetUv = uv;
        vSheetPosition = sheetP;`,
      )

    program.fragmentShader =
      constants +
      `uniform sampler2D uFront;
      uniform sampler2D uBack;
      uniform sampler2D uPattern;
      uniform vec3 uSpineContact;
      uniform vec3 uLightDirection;
      varying vec2 vSheetUv;
      varying vec3 vSheetPosition;
      ${shader.fragmentChunk ?? ''}

      // Right where a turning sheet leaves the spine it all but touches the pages under it, and
      // the shadow map's depth bias can't tell them apart: a thin strip next to the spine stays
      // lit, which reads as a light seam. There the sheet is a plane through the spine
      // (uSpineContact.xy is its direction across, z says whether a sheet is turning), so test
      // the way to the light against that plane directly.
      float sheetContactShadow(vec3 p, float intensity) {
        if (uSpineContact.z < 0.5) return 1.0;
        vec3 across = vec3(uSpineContact.x, 0.0, uSpineContact.y);
        vec3 normal = vec3(-uSpineContact.y, 0.0, uSpineContact.x);
        float facing = dot(normal, uLightDirection);
        if (abs(facing) < 1e-4) return 1.0;
        float t = -dot(normal, p) / facing;
        if (t <= 1e-4) return 1.0;
        vec3 hit = p + t * uLightDirection;
        float along = dot(hit, across);
        if (along <= 0.0 || along > CONTACT_REACH || abs(hit.y) > SHEET_ASPECT * 0.5) return 1.0;
        return 1.0 - intensity;
      }
      ` +
      program.fragmentShader
    program.fragmentShader = program.fragmentShader
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        ${shader.fragmentChunk ? 'if (sheetHidden(vSheetPosition)) discard;' : ''}`,
      )
      // light whichever side faces the camera
      .replace(
        '#include <normal_fragment_begin>',
        `vec3 normal = normalize(vNormal);
        float faceDirection = normal.z >= 0.0 ? 1.0 : -1.0;
        normal *= faceDirection;
        vec3 nonPerturbedNormal = normal;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 frontColor = texture2D(uFront, vSheetUv);
        vec4 backColor = texture2D(uBack, vec2(1.0 - vSheetUv.x, vSheetUv.y));
        ${
          paper.cutout
            ? `// Cut to the front page: no paper where it's transparent. The edge that's left
        // keeps its own colour (page images are premultiplied, so divide the alpha out) rather
        // than fading to paper, which would leave a pale fringe.
        if (frontColor.a < 0.5) discard;
        frontColor = vec4(frontColor.rgb / frontColor.a, 1.0);
        backColor = backColor.a > 0.01 ? vec4(backColor.rgb / backColor.a, 1.0) : vec4(BLANK_PAPER, 1.0);`
            : `// Transparent artwork is unprinted paper, not a hole in the sheet. Page images are
        // premultiplied, so this is "over" compositing onto the paper colour.
        frontColor = vec4(frontColor.rgb + BLANK_PAPER * (1.0 - frontColor.a), 1.0);
        backColor = vec4(backColor.rgb + BLANK_PAPER * (1.0 - backColor.a), 1.0);`
        }
        vec4 faceColor = gl_FrontFacing ? frontColor : backColor;
        vec4 otherColor = gl_FrontFacing ? backColor : frontColor;
        // thin paper lets some of the other side through
        vec4 sheetColor = faceColor;
        sheetColor.rgb *= mix(vec3(1.0), otherColor.rgb, SHOW_THROUGH);
        diffuseColor *= sheetColor;
        float inkAmount = 1.0 - dot(faceColor.rgb, vec3(0.299, 0.587, 0.114));`,
      )
      // directional shadows: whichever is darker of the shadow map and the contact test
      .replace('#include <lights_fragment_begin>', withContactShadow(THREE.ShaderChunk.lights_fragment_begin))
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // ink sits glossier than bare paper; fibres are rougher
        roughnessFactor *= 1.0 - inkAmount * INK_GLOSS;
        float pattern = texture2D(uPattern, vSheetUv * PATTERN_SIZE * vec2(1.0, SHEET_ASPECT)).r;
        pattern = 2.0 * pow(pattern, 7.0);
        roughnessFactor = clamp(mix(roughnessFactor, 1.0, clamp(pattern * PATTERN_ROUGHNESS, 0.0, 1.0)), 0.0, 1.0);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), pattern * PATTERN_DARKEN);`,
      )
  }

  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  })
  const distanceMaterial = new THREE.MeshDistanceMaterial({ side: THREE.DoubleSide })
  // Point lights use a distance pass; directional and spot lights use a depth pass.
  // Both must draw precisely the same deformed, trimmed silhouette as the visible sheet.
  depthMaterial.onBeforeCompile = distanceMaterial.onBeforeCompile = (program) => {
    Object.assign(program.uniforms, uniforms)
    program.vertexShader = constants + shader.vertexChunk + 'varying vec2 vSheetUv;\nvarying vec3 vSheetPosition;\n' + program.vertexShader
    program.vertexShader = program.vertexShader.replace(
      '#include <begin_vertex>',
      `vSheetUv = uv;
      vSheetPosition = sheetPosition(uv, ${noiseAt('x')});
      vec3 transformed = vSheetPosition - vec3(SHADOW_OFFSET_X, 0.0, 0.0);`,
    )
    program.fragmentShader = constants + `
      uniform sampler2D uFront;
      varying vec2 vSheetUv;
      varying vec3 vSheetPosition;
      ${shader.fragmentChunk ?? ''}
    ` + program.fragmentShader
    program.fragmentShader = program.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      ${paper.cutout ? 'if (texture2D(uFront, vSheetUv).a < 0.5) discard;' : ''}
      ${shader.fragmentChunk ? 'if (sheetHidden(vSheetPosition)) discard;' : ''}`,
    )
  }

  // three.js reuses a compiled program whose cache key matches, and the default key is the
  // onBeforeCompile source, the same for every sheet. The generated code is what differs (layout,
  // page aspect, paper), so it is the key: magazines sharing a renderer each get their own.
  const cacheKey = constants + shader.vertexChunk + (shader.fragmentChunk ?? '') + (paper.cutout ? 'cutout' : '')
  material.customProgramCacheKey = () => cacheKey
  depthMaterial.customProgramCacheKey = () => cacheKey
  distanceMaterial.customProgramCacheKey = () => cacheKey

  return { material, depthMaterial, distanceMaterial }
}

const DIRECTIONAL_SHADOW =
  'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )'

// If a future three.js words this differently, sheets just go without the contact shadow.
function withContactShadow(chunk: string) {
  if (!chunk.includes(DIRECTIONAL_SHADOW)) return chunk
  return chunk.replace(
    DIRECTIONAL_SHADOW,
    `min( ${DIRECTIONAL_SHADOW}, sheetContactShadow( vSheetPosition, directionalLightShadow.shadowIntensity ) )`,
  )
}

export type SheetMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>

export function createSheetMesh(
  geometry: THREE.BufferGeometry,
  uniforms: SheetUniforms,
  shader: SheetShader,
  settings: ResolvedSettings,
): SheetMesh {
  const { material, depthMaterial, distanceMaterial } = createPaperMaterials(uniforms, shader, settings)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.customDepthMaterial = depthMaterial
  mesh.customDistanceMaterial = distanceMaterial
  mesh.castShadow = settings.lighting.shadows
  mesh.receiveShadow = settings.lighting.shadows
  mesh.frustumCulled = false
  return mesh
}

/**
 * Every sheet rises from the spine at height 0, so along the spine they all but touch and
 * the depth buffer can't separate them: sheets further down flicker through as a light seam.
 * Bias each sheet's depth by its place in the stack instead: the top sheet wins, and a sheet
 * that's turning wins over everything.
 */
export function layerSheet(mesh: SheetMesh, depth: number, count: number, moving: boolean) {
  const material = mesh.material
  material.polygonOffset = true
  material.polygonOffsetFactor = 0
  material.polygonOffsetUnits = moving ? -(count + 4) : -(count - Math.min(depth, count))
  mesh.renderOrder = depth
}

export function disposeSheetMesh(mesh: SheetMesh) {
  mesh.material.dispose()
  mesh.customDepthMaterial?.dispose()
  mesh.customDistanceMaterial?.dispose()
}

/** A 1×1 texture of one colour, for blank pages and placeholders. */
export function solidTexture(color: THREE.ColorRepresentation): THREE.DataTexture {
  const c = new THREE.Color(color)
  const srgb = c.clone().convertLinearToSRGB()
  const texture = new THREE.DataTexture(
    new Uint8Array([Math.round(srgb.r * 255), Math.round(srgb.g * 255), Math.round(srgb.b * 255), 255]),
    1,
    1,
  )
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
