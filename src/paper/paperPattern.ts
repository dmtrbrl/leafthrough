import * as THREE from 'three'

// A tiling paper grain: cloudy pulp plus short fibres. The sheet shader only cares about
// the brightest bits (pow 7), which come out as faint darker fibres and rougher spots.
const SIZE = 384

function periodicNoise(period: number, seed: number) {
  const grid = new Float32Array(period * period)
  let s = seed >>> 0
  for (let i = 0; i < grid.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    grid[i] = s / 4294967296
  }
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx
    return a + (b - a) * sy
  }
}

export function createPaperPattern(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(SIZE, SIZE)

  const octaves = [4, 8, 16, 32, 96].map((period, i) => ({ period, noise: periodicNoise(period, 11 + i * 17) }))
  const weights = [0.5, 0.25, 0.14, 0.08, 0.05]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = 0
      octaves.forEach(({ period, noise }, i) => {
        v += weights[i] * noise((x / SIZE) * period, (y / SIZE) * period)
      })
      const g = Math.round(255 * (0.8 + (v - 0.5) * 0.42))
      const o = (y * SIZE + x) * 4
      image.data[o] = image.data[o + 1] = image.data[o + 2] = g
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)

  // fibres, drawn wrapped so the tile stays seamless
  let s = 7
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  ctx.lineCap = 'round'
  for (let i = 0; i < 2600; i++) {
    const x = random() * SIZE
    const y = random() * SIZE
    const angle = random() * Math.PI * 2
    const length = 3 + random() * 14
    const bend = (random() - 0.5) * length * 0.8
    const light = random() < 0.65
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.08 + random() * 0.22})` : `rgba(0,0,0,${0.03 + random() * 0.08})`
    ctx.lineWidth = 0.5 + random() * 0.9
    for (const ox of [-SIZE, 0, SIZE]) {
      for (const oy of [-SIZE, 0, SIZE]) {
        const ax = x + ox
        const ay = y + oy
        if (ax < -20 || ax > SIZE + 20 || ay < -20 || ay > SIZE + 20) continue
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.quadraticCurveTo(
          ax + Math.cos(angle) * length * 0.5 - Math.sin(angle) * bend,
          ay + Math.sin(angle) * length * 0.5 + Math.cos(angle) * bend,
          ax + Math.cos(angle) * length,
          ay + Math.sin(angle) * length,
        )
        ctx.stroke()
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return texture
}
