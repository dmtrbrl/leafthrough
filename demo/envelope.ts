import * as THREE from 'three'

// A portrait paperboard mailer, in page-width units. Its panels, mouth and flexible
// closure are geometry, so the cast shadows follow the paper in every animation frame.
export const ENVELOPE = { width: 1.1, height: 1.48, depth: 0.014, flapLength: 0.25 }
const { width: W, height: H, depth: Z } = ENVELOPE
const smooth = THREE.MathUtils.smoothstep

export function createEnvelope(renderer: THREE.WebGLRenderer) {
  const group = new THREE.Group()
  const resources: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(resource: T): T => { resources.push(resource); return resource }

  // Fine uncoated stock: restrained colour variation and microscopic relief, with the
  // same physical grain scale on every panel. No photographed lighting baked into the paper.
  const size = 256
  const pixels = new Uint8Array(size * size * 4)
  let seed = 73
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (1664525 * seed + 1013904223) >>> 0
    const value = 128 + Math.round((seed / 4294967296 - 0.5) * 36)
    pixels.set([value, value, value, 255], i)
  }
  const grain = keep(new THREE.DataTexture(pixels, size, size))
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping
  grain.magFilter = THREE.LinearFilter
  grain.minFilter = THREE.LinearMipmapLinearFilter
  grain.generateMipmaps = true
  grain.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  grain.needsUpdate = true
  // The body and both flap faces are the same stock. Let the lighting shade the inside
  // rather than painting it a darker colour that looks like a separate panel when open.
  const stock = keep(new THREE.MeshStandardMaterial({
    color: '#faf6ec', roughness: 0.94, metalness: 0, bumpMap: grain, bumpScale: 0.0002, side: THREE.DoubleSide,
  }))

  function panel(points: [number, number][], height: number, material: THREE.MeshStandardMaterial) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
    const geometry = keep(new THREE.ShapeGeometry(shape))
    const uv = geometry.attributes.uv
    const pos = geometry.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 5, pos.getY(i) * 5)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.z = height
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  panel([[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]], 0.001, stock)
  // A paperboard sleeve with a long-edge opening and a shallow thumb notch. Its broad
  // back sits above the magazine; three glued margins close the other edges.
  const mouth = W / 2 - 0.014
  const body = new THREE.Shape()
  body.moveTo(-W / 2, -H / 2)
  body.lineTo(mouth, -H / 2)
  body.lineTo(mouth, -0.055)
  body.quadraticCurveTo(mouth - 0.072, 0, mouth, 0.055)
  body.lineTo(mouth, H / 2)
  body.lineTo(-W / 2, H / 2)
  body.closePath()
  const backGeometry = keep(new THREE.ShapeGeometry(body, 20))
  const back = new THREE.Mesh(backGeometry, stock)
  back.position.z = Z
  back.castShadow = back.receiveShadow = true
  group.add(back)
  const bodyUV = backGeometry.attributes.uv
  for (let i = 0; i < bodyUV.count; i++) bodyUV.setXY(i, bodyUV.getX(i) * 5, bodyUV.getY(i) * 5)

  // The thin folded paperboard edges close the sleeve and reveal its small real thickness.
  for (const y of [-H / 2, H / 2]) {
    const edge = new THREE.Mesh(keep(new THREE.BoxGeometry(W, 0.002, Z)), stock)
    edge.position.set(0, y, Z / 2)
    edge.castShadow = edge.receiveShadow = true
    group.add(edge)
  }
  const end = new THREE.Mesh(keep(new THREE.BoxGeometry(0.002, H, Z)), stock)
  end.position.set(-W / 2, 0, Z / 2)
  end.castShadow = end.receiveShadow = true
  group.add(end)

  // Quiet one-colour printing on the stock, kept away from the closure on the right.
  const printCanvas = Object.assign(document.createElement('canvas'), { width: 1100, height: 1480 })
  const ink = printCanvas.getContext('2d')!
  ink.fillStyle = '#57594e'
  ink.font = '680 57px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif'
  ink.letterSpacing = '-2px'
  ink.fillText('LeafThrough', 200, 620)
  ink.letterSpacing = '0px'
  ink.fillStyle = '#848577'
  ink.font = '18px sans-serif'
  ink.letterSpacing = '3px'
  ink.fillText('THE PRINTED EDITION', 123, 665)
  ink.letterSpacing = '0px'
  ink.fillStyle = '#939184'
  ink.fillRect(123, 1045, 430, 1.5)
  ink.font = '17px monospace'
  ink.fillText('ISSUE 01    /    PRINTED MATTER', 123, 1090)
  ink.fillText('A study in pages, texture and motion.', 123, 1120)
  const printTexture = keep(new THREE.CanvasTexture(printCanvas))
  printTexture.colorSpace = THREE.SRGBColorSpace
  printTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  let disposed = false
  new THREE.ImageLoader().load(new URL('./assets/logos/leafthrough-page-turn.svg', import.meta.url).href, (image) => {
    if (disposed) return
    ink.drawImage(image, 120, 568, 62, 62)
    printTexture.needsUpdate = true
  })
  const print = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), keep(new THREE.MeshStandardMaterial({
    map: printTexture, transparent: true, roughness: 1, depthWrite: false,
  })))
  print.position.z = Z + 0.0002
  print.receiveShadow = true
  group.add(print)

  // A short, round-cornered tuck flap, tessellated along its length so the fold can flex.
  const rows = 72
  const columns = 20
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = []
  const base = H / 2 - 0.018
  const length = ENVELOPE.flapLength
  const corner = 0.026
  const halfWidth = (d: number) => d < length - corner ? base
    : base - corner + Math.sqrt(Math.max(0, corner ** 2 - (d - length + corner) ** 2))
  for (let row = 0; row <= rows; row++) {
    const d = row / rows * length
    for (let column = 0; column <= columns; column++) {
      const y = (column / columns * 2 - 1) * halfWidth(d)
      vertices.push(d, y, 0)
      uvs.push(d * 5, y * 5)
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const flapGeometry = keep(new THREE.BufferGeometry())
  flapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  flapGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  flapGeometry.setIndex(indices)
  const flap = new THREE.Group()
  const face = new THREE.Mesh(flapGeometry, stock)
  face.castShadow = face.receiveShadow = true
  // Vertex positions change each frame; a closed flap's box isn't its open bounds.
  face.frustumCulled = false
  flap.add(face)
  const edgeGeometry = keep(new THREE.BufferGeometry())
  edgeGeometry.setAttribute('position', flapGeometry.attributes.position)
  const perimeter: number[] = []
  for (let row = 0; row <= rows; row++) perimeter.push(row * (columns + 1))
  for (let row = rows; row >= 0; row--) perimeter.push(row * (columns + 1) + columns)
  perimeter.push(0)
  edgeGeometry.setIndex(perimeter)
  flap.add(new THREE.Line(edgeGeometry, keep(new THREE.LineBasicMaterial({
    color: '#b3ab98', transparent: true, opacity: 0.32, depthWrite: false,
  }))))
  flap.position.x = W / 2
  group.add(flap)

  // Only contact occlusion is painted: one footprint under the envelope. Directional
  // shadows, including the lifted flap and the magazine inside, come from the scene light.
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 320 })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.filter = 'blur(7px)'
  ctx.fillStyle = 'white'
  ctx.fillRect(16, 16, 224, 288)
  const contact = new THREE.Mesh(keep(new THREE.PlaneGeometry(W + 0.14, H + 0.14)), keep(new THREE.MeshBasicMaterial({
    color: '#594b35', alphaMap: keep(new THREE.CanvasTexture(canvas)), transparent: true,
    opacity: 0.13, depthWrite: false,
  })))
  contact.position.z = 0.0001
  group.add(contact)

  let previous = -1
  function setOpen(open: number) {
    if (open === previous) return
    previous = open
    const hinge = Math.PI * (1 - open)
    // The tip follows the crease with a small delay, without the floppy curl of a page turn.
    const curvature = 0.8 * Math.sin(Math.PI * open) / length
    const position = flapGeometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const d = vertices[3 * i]
      const x = curvature < 1e-5 ? d * Math.cos(hinge) : (Math.sin(hinge + curvature * d) - Math.sin(hinge)) / curvature
      const z = curvature < 1e-5 ? d * Math.sin(hinge) : (Math.cos(hinge) - Math.cos(hinge + curvature * d)) / curvature
      position.setXYZ(i, x, vertices[3 * i + 1], z)
    }
    position.needsUpdate = true
    flapGeometry.computeVertexNormals()
    flap.position.z = THREE.MathUtils.lerp(Z + 0.002, 0.002, smooth(open, 0.65, 1))
  }
  setOpen(0)
  return { group, setOpen, dispose: () => { disposed = true; resources.forEach(resource => resource.dispose()) } }
}
