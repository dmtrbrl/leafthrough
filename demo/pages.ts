// Placeholder artwork for the demo: a 28-page issue drawn on canvases. Each canvas is a
// valid page source for the magazine.

const PX_W = 768
// set per call to generatePages(), so the artwork matches the page aspect
let PX_H = Math.round(PX_W * 1.377)
const MONO = '"SF Mono", "JetBrains Mono", Menlo, ui-monospace, monospace'

interface Theme {
  bg: string
  ink: string
  dim: string
  soft: string
  accent?: string
}

const THEMES: Theme[] = [
  { bg: '#1d1c1a', ink: '#d6a552', dim: 'rgba(214,165,82,0.25)', soft: 'rgba(214,165,82,0.6)' },
  { bg: '#ebe5d5', ink: '#1d1c1a', dim: 'rgba(29,28,26,0.18)', soft: 'rgba(29,28,26,0.55)', accent: '#3a5fd9' },
]

const WORDS = ['fold', 'turn', 'bend', 'curl', 'leaf', 'flip', 'sheet', 'paper', 'crease', 'spine', 'press', 'ink', 'grain']
const GLYPHS = ['a', 'g', '&', 'R', '{', '7', '@', 'Q', 'f', '%', 'k', '#', '?']
const COPY =
  'A magazine is a stack of folded sheets held together at the spine. Each sheet is two pages, ' +
  'one on each side. When you turn a page you are really lifting a sheet, bending it over a ' +
  'little cylinder of air and laying it down on the other stack. The paper never stretches; ' +
  'it only rolls, lifts, ripples and settles. '

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function font(ctx: CanvasRenderingContext2D, size: number, weight = 400) {
  ctx.font = `${weight} ${size}px ${MONO}`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = text.split(' ')
  let line = ''
  let lines = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, y + lines * lineHeight)
      line = w
      if (++lines >= maxLines) return
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight)
}

// running header and folio on a single page; x0 is the page's left edge on the spread
function chrome(ctx: CanvasRenderingContext2D, theme: Theme, x0: number, pageNumber: number, label: string) {
  const left = pageNumber % 2 === 0
  ctx.fillStyle = theme.soft
  font(ctx, 15)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = left ? 'left' : 'right'
  const outer = left ? x0 + 48 : x0 + PX_W - 48
  ctx.fillText(String(pageNumber).padStart(2, '0'), outer, PX_H - 40)
  ctx.fillText('FOLDABLE / ISSUE 01', outer, 56)
  ctx.textAlign = left ? 'right' : 'left'
  ctx.fillText(label, left ? x0 + PX_W - 48 : x0 + 48, 56)
  ctx.textAlign = 'left'
}

function grid(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, w: number, h: number, step: number) {
  ctx.strokeStyle = theme.dim
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let gx = x; gx <= x + w + 0.5; gx += step) {
    ctx.moveTo(Math.round(gx) + 0.5, y)
    ctx.lineTo(Math.round(gx) + 0.5, y + h)
  }
  for (let gy = y; gy <= y + h + 0.5; gy += step) {
    ctx.moveTo(x, Math.round(gy) + 0.5)
    ctx.lineTo(x + w, Math.round(gy) + 0.5)
  }
  ctx.stroke()
}

function metricLines(ctx: CanvasRenderingContext2D, theme: Theme, x: number, w: number, baseline: number, size: number) {
  const lines: [string, number][] = [
    ['ascender', baseline - size * 0.78],
    ['x-height', baseline - size * 0.52],
    ['baseline', baseline],
    ['descender', baseline + size * 0.22],
  ]
  font(ctx, 13)
  for (const [name, y] of lines) {
    ctx.strokeStyle = theme.dim
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(x, Math.round(y) + 0.5)
    ctx.lineTo(x + w, Math.round(y) + 0.5)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = theme.soft
    ctx.fillText(name, x + 6, y - 6)
  }
}

function halftone(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, w: number, h: number, random: () => number) {
  const step = 18
  const cx = x + w * (0.3 + random() * 0.4)
  const cy = y + h * (0.3 + random() * 0.4)
  const reach = Math.max(w, h) * 0.75
  ctx.fillStyle = theme.ink
  for (let py = y + step / 2; py < y + h; py += step) {
    for (let px = x + step / 2; px < x + w; px += step) {
      const d = Math.hypot(px - cx, py - cy) / reach
      const r = (1 - d) * step * 0.55
      if (r <= 0.4) continue
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawSpread(ctx: CanvasRenderingContext2D, k: number, theme: Theme, random: () => number) {
  const W2 = PX_W * 2
  const layout = k % 4
  const leftNo = k * 2
  const rightNo = k * 2 + 1

  if (layout === 0) {
    // one big word running across the gutter
    const word = WORDS[k % WORDS.length]
    grid(ctx, theme, 48, 96, W2 - 96, PX_H - 192, 48)
    let size = 520
    font(ctx, size, 500)
    while (ctx.measureText(word).width > W2 - 140 && size > 120) font(ctx, (size -= 10), 500)
    const baseline = PX_H * 0.62
    metricLines(ctx, theme, 48, W2 - 96, baseline, size)
    ctx.fillStyle = theme.ink
    ctx.textAlign = 'center'
    ctx.fillText(word, W2 / 2, baseline)
    ctx.textAlign = 'left'
    font(ctx, 18)
    ctx.fillStyle = theme.soft
    ctx.fillText(`fig. ${String(k).padStart(2, '0')}: "${word}", ${size}px`, 64, PX_H - 96)
  } else if (layout === 1) {
    // a glyph per page with its metrics
    for (const [i, x0] of [[0, 0], [1, PX_W]]) {
      const g = GLYPHS[(k * 2 + i) % GLYPHS.length]
      const size = 560
      const baseline = PX_H * 0.66
      metricLines(ctx, theme, x0 + 48, PX_W - 96, baseline, size)
      font(ctx, size, 500)
      ctx.fillStyle = i === 0 || !theme.accent ? theme.ink : theme.accent
      ctx.textAlign = 'center'
      ctx.fillText(g, x0 + PX_W / 2, baseline)
      ctx.textAlign = 'left'
      font(ctx, 16)
      ctx.fillStyle = theme.soft
      ctx.fillText(`U+${g.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`, x0 + 64, PX_H - 96)
    }
  } else if (layout === 2) {
    // text left, character set right
    font(ctx, 64, 500)
    ctx.fillStyle = theme.ink
    ctx.fillText('On turning', 64, 170)
    ctx.fillText('pages.', 64, 240)
    font(ctx, 19)
    ctx.fillStyle = theme.ink
    const col = (PX_W - 64 * 2 - 32) / 2
    wrap(ctx, COPY.repeat(3), 64, 320, col, 30, 20)
    wrap(ctx, COPY.repeat(3).slice(180), 64 + col + 32, 320, col, 30, 20)

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&@#%?!{}[]'
    const cols = 6
    const cell = (PX_W - 96) / cols
    grid(ctx, theme, PX_W + 48, 110, cell * cols, cell * 9, cell)
    font(ctx, cell * 0.55, 500)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < Math.min(chars.length, cols * 9); i++) {
      const cx = PX_W + 48 + (i % cols) * cell + cell / 2
      const cy = 110 + Math.floor(i / cols) * cell + cell / 2
      ctx.fillStyle = theme.accent && i % 7 === 3 ? theme.accent : theme.ink
      ctx.fillText(chars[i], cx, cy)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  } else {
    // halftone across the spread with a pull quote
    halftone(ctx, theme, 48, 96, W2 - 96, PX_H - 260, random)
    ctx.fillStyle = theme.bg
    ctx.fillRect(PX_W + 64, PX_H - 330, PX_W - 128, 200)
    font(ctx, 34, 500)
    ctx.fillStyle = theme.accent || theme.ink
    wrap(ctx, '"The paper never stretches. It only rolls."', PX_W + 88, PX_H - 270, PX_W - 176, 46, 3)
  }

  chrome(ctx, theme, 0, leftNo, WORDS[(k + 3) % WORDS.length])
  chrome(ctx, theme, PX_W, rightNo, WORDS[(k + 5) % WORDS.length])
}

function drawCover(ctx: CanvasRenderingContext2D, theme: Theme, back: boolean) {
  ctx.fillStyle = theme.ink
  if (back) {
    font(ctx, 20)
    ctx.fillStyle = theme.soft
    ctx.fillText('FOLDABLE / ISSUE 01', 64, PX_H - 120)
    ctx.fillText('printed on pixels', 64, PX_H - 90)
    halftone(ctx, theme, 64, 96, PX_W - 128, PX_W - 128, rng(99))
    return
  }
  grid(ctx, theme, 48, 48, PX_W - 96, PX_H - 96, 48)
  font(ctx, 300, 600)
  ctx.fillText('FOLD', 40, 330)
  ctx.fillText('ABLE', 40, 610)
  font(ctx, 22)
  ctx.fillStyle = theme.soft
  ctx.fillText('ISSUE 01', 64, PX_H - 140)
  ctx.fillText('a magazine about turning pages', 64, PX_H - 104)
  ctx.textAlign = 'right'
  ctx.fillText('28 pp.', PX_W - 64, PX_H - 104)
  ctx.textAlign = 'left'
}

/** Draws `count` pages (front cover first) at `aspect` (height ÷ width). */
export function generatePages(count = 28, aspect = 1.377): HTMLCanvasElement[] {
  PX_H = Math.round(PX_W * aspect)
  const pages = []
  const cover = canvas(PX_W, PX_H)
  let ctx = cover.getContext('2d')!
  ctx.fillStyle = THEMES[0].bg
  ctx.fillRect(0, 0, PX_W, PX_H)
  drawCover(ctx, THEMES[0], false)
  pages.push(cover)

  for (let k = 1; k < count / 2; k++) {
    const theme = THEMES[k % THEMES.length]
    const spread = canvas(PX_W * 2, PX_H)
    ctx = spread.getContext('2d')!
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, PX_W * 2, PX_H)
    drawSpread(ctx, k, theme, rng(k * 31 + 7))
    for (const x of [0, PX_W]) {
      const page = canvas(PX_W, PX_H)
      page.getContext('2d')!.drawImage(spread, x, 0, PX_W, PX_H, 0, 0, PX_W, PX_H)
      pages.push(page)
    }
  }

  const back = canvas(PX_W, PX_H)
  ctx = back.getContext('2d')!
  ctx.fillStyle = THEMES[0].bg
  ctx.fillRect(0, 0, PX_W, PX_H)
  drawCover(ctx, THEMES[0], true)
  pages.push(back)
  return pages.slice(0, count)
}
