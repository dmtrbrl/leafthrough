import * as THREE from 'three'
import type { ResolvedSettings } from '../options.js'

export type SheetUniforms = Record<string, THREE.IUniform>

export interface SheetShader {
  /** GLSL defining `vec3 sheetPosition(vec2 uv, float noise)` and its uniforms. */
  vertexChunk: string
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
  const constants = /* glsl */ `
    const float SHEET_ASPECT = ${glslFloat(pageAspect)};
    const float NORMAL_EPSILON = ${glslFloat(shader.epsilon)};
    const float PATTERN_SIZE = ${glslFloat(paper.grainScale)};
    const float PATTERN_DARKEN = ${glslFloat(paper.grain === false ? 0 : paper.grainStrength)};
    const float PATTERN_ROUGHNESS = 0.33;
    const float SHOW_THROUGH = ${glslFloat(paper.showThrough)};
    const float INK_GLOSS = ${glslFloat(paper.inkGloss)};
    const float SHADOW_OFFSET_X = ${glslFloat(shader.shadowOffsetX)};
  `
  const noiseAt = (component: string) => (shader.noise ? `aNoise.${component}` : '0.0')

  const material = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    metalness: paper.metalness,
    roughness: paper.roughness,
  })

  material.onBeforeCompile = (program) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader = constants + shader.vertexChunk + 'varying vec2 vSheetUv;\n' + program.vertexShader
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
        vSheetUv = uv;`,
      )

    program.fragmentShader =
      constants +
      `uniform sampler2D uFront;
      uniform sampler2D uBack;
      uniform sampler2D uPattern;
      varying vec2 vSheetUv;
      ` +
      program.fragmentShader
    program.fragmentShader = program.fragmentShader
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
        vec4 faceColor = gl_FrontFacing ? frontColor : backColor;
        vec4 otherColor = gl_FrontFacing ? backColor : frontColor;
        // thin paper lets some of the other side through
        vec4 sheetColor = faceColor;
        sheetColor.rgb *= mix(vec3(1.0), otherColor.rgb, SHOW_THROUGH);
        diffuseColor *= sheetColor;
        float inkAmount = 1.0 - dot(faceColor.rgb, vec3(0.299, 0.587, 0.114));`,
      )
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
  depthMaterial.onBeforeCompile = (program) => {
    Object.assign(program.uniforms, uniforms)
    program.vertexShader = constants + shader.vertexChunk + program.vertexShader
    program.vertexShader = program.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = sheetPosition(uv, ${noiseAt('x')}) - vec3(SHADOW_OFFSET_X, 0.0, 0.0);`,
    )
  }

  return { material, depthMaterial }
}

export type SheetMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>

export function createSheetMesh(
  geometry: THREE.BufferGeometry,
  uniforms: SheetUniforms,
  shader: SheetShader,
  settings: ResolvedSettings,
): SheetMesh {
  const { material, depthMaterial } = createPaperMaterials(uniforms, shader, settings)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.customDepthMaterial = depthMaterial
  mesh.castShadow = settings.lighting.shadows
  mesh.receiveShadow = settings.lighting.shadows
  mesh.frustumCulled = false
  return mesh
}

export function disposeSheetMesh(mesh: SheetMesh) {
  mesh.material.dispose()
  mesh.customDepthMaterial?.dispose()
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
