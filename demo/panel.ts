import type { Layout, LeafThroughOptions, PageChangeDetail, PageSource } from 'leafthrough'
import { DEFAULT_SPREAD_QUERY, resolveSettings } from '../src/options'
import { demoPages } from './pages'

// The dev panel: every option, method and property of the magazine, shared by all the
// demo pages. Each page wires it to its own binding (React props, Vue props, the Svelte
// action, the element), so the panel exercises the bindings as well as the core.

/** What the panel needs from a mounted magazine, whichever binding it came from. */
export interface MagazineHandle {
  next(): boolean
  prev(): boolean
  goTo(page: number, options?: { animate?: boolean }): void
  readonly page: number
  readonly visiblePages: number[]
  readonly pageCount: number
  readonly layout: Layout | undefined
}

export interface PanelHost {
  /** Hands the full option set to the binding, through its normal update path. */
  apply(options: LeafThroughOptions): void
  /** Throws the magazine away and creates it again (startPage only applies here). */
  remount(options: LeafThroughOptions): void
  handle(): MagazineHandle | null
}

export interface Panel {
  /** The options to create the magazine with. */
  options(): LeafThroughOptions
  /** Record an event from the binding (pagechange, ready, error). */
  event(name: string, detail?: unknown): void
}

type DataOptions = Omit<LeafThroughOptions, 'pages' | 'onPageChange' | 'onReady' | 'onPageLoad' | 'onError' | 'formatPageLabel'>
type Source = 'urls' | 'broken'
type Grain = 'on' | 'off' | 'coarse'

// Everything the panel controls. Plain data, so it fits in the URL.
interface State {
  pageCount?: number
  source?: Source
  grain?: Grain
  customLabel?: boolean
  options: DataOptions
}

const INITIAL: State = {
  options: { startPage: 0, label: 'LeafThrough / Issue 01', interaction: { keyboard: 'global' } },
}

// --- state ↔ options ---------------------------------------------------------------

const pageCache = new Map<string, PageSource[]>()
function pagesFor(count: number, source: Source): PageSource[] {
  const key = `${count}:${source}`
  let pages = pageCache.get(key)
  if (!pages) {
    // Repeat the issue only when exercising larger page counts.
    pages = Array.from({ length: count }, (_, i) =>
      source === 'broken' && i === 2 ? './missing-page.png' : demoPages[i % demoPages.length],
    )
    pageCache.set(key, pages)
  }
  return pages
}

let coarseGrain: HTMLCanvasElement | undefined
function coarse() {
  if (coarseGrain) return coarseGrain
  coarseGrain = document.createElement('canvas')
  coarseGrain.width = coarseGrain.height = 256
  const ctx = coarseGrain.getContext('2d')!
  ctx.fillStyle = '#b3b3b3'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`
    ctx.beginPath()
    ctx.arc(Math.random() * 256, Math.random() * 256, 0.6 + Math.random() * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  return coarseGrain
}

function buildOptions(state: State): LeafThroughOptions {
  const paper = { ...state.options.paper }
  if (state.grain) paper.grain = state.grain === 'coarse' ? coarse() : state.grain === 'on'
  return {
    ...state.options,
    paper: Object.keys(paper).length ? paper : undefined,
    pages: pagesFor(state.pageCount ?? demoPages.length, state.source ?? 'urls'),
    formatPageLabel: state.customLabel
      ? ({ visiblePages, pageCount }: PageChangeDetail) =>
          `Now showing ${visiblePages.map((p) => p + 1).join(' and ') || 'nothing'}, ${pageCount} in all`
      : undefined,
  }
}

function getPath(object: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => (o == null ? undefined : (o as Record<string, unknown>)[key]), object)
}

// sets a nested value; undefined removes it, along with any parents it leaves empty
function setPath(object: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  const parents: Record<string, unknown>[] = [object]
  for (const key of keys.slice(0, -1)) {
    const parent = parents[parents.length - 1]
    if (typeof parent[key] !== 'object' || parent[key] === null) parent[key] = {}
    parents.push(parent[key] as Record<string, unknown>)
  }
  const last = keys[keys.length - 1]
  if (value === undefined) delete parents[parents.length - 1][last]
  else parents[parents.length - 1][last] = value
  for (let i = parents.length - 1; i > 0; i--) {
    if (Object.keys(parents[i]).length) break
    delete parents[i - 1][keys[i - 1]]
  }
}

function loadState(): State {
  try {
    const hash = decodeURIComponent(location.hash.slice(1))
    if (hash) return { options: {}, ...JSON.parse(hash) }
  } catch {}
  return structuredClone(INITIAL)
}

// --- controls ------------------------------------------------------------------------

interface Control {
  label: string
  hint?: string
  kind: 'select' | 'range' | 'toggle' | 'color' | 'text' | 'vec3'
  choices?: [string, unknown][]
  min?: number
  max?: number
  step?: number
  read(): unknown
  write(value: unknown): void
  fallback(): unknown
}

/**
 * Builds the panel into `container` and returns the initial options plus an event sink.
 */
export function createDevPanel(container: HTMLElement, host: PanelHost): Panel {
  let state = loadState()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const layoutNow = (): Layout =>
    host.handle()?.layout ?? (state.options.layout && state.options.layout !== 'auto' ? state.options.layout : 'spread')
  const resolved = () => resolveSettings(buildOptions(state), layoutNow(), reducedMotion.matches)

  // a control bound to an option path, with its default read from the resolved settings
  const option = (
    path: string,
    label: string,
    kind: Control['kind'],
    extra: Partial<Control> & { defaultValue?: unknown } = {},
  ): Control => ({
    label,
    kind,
    read: () => getPath(state.options, path),
    write: (value) => setPath(state.options as Record<string, unknown>, path, value),
    fallback: () => ('defaultValue' in extra ? extra.defaultValue : getPath(resolved(), path)),
    ...extra,
  })
  const range = (min: number, max: number, step: number) => ({ min, max, step })

  const sections: { title: string; open?: boolean; controls: Control[] }[] = [
    {
      title: 'Pages',
      open: true,
      controls: [
        {
          label: 'pages (count)',
          kind: 'select',
          choices: [['12 (magazine)', 12], ['28 (repeat)', 28], ['7 (odd)', 7], ['2', 2]],
          read: () => state.pageCount,
          write: (v) => (state.pageCount = v as number | undefined),
          fallback: () => demoPages.length,
        },
        {
          label: 'pages (source)',
          hint: 'Magazine image URLs, or URLs with page 3 missing (tests onError)',
          kind: 'select',
          choices: [['image URLs', 'urls'], ['URLs, one broken', 'broken']],
          read: () => state.source,
          write: (v) => (state.source = v as Source | undefined),
          fallback: () => 'urls',
        },
        option('startPage', 'startPage', 'range', { ...range(0, 27, 1), hint: 'Applies on Remount', defaultValue: 0 }),
        option('pageAspect', 'pageAspect', 'range', range(0.7, 2, 0.01)),
        option('preload', 'preload', 'range', {
          ...range(0, 12, 1),
          hint: 'Pages loaded ahead; twice as far away unload',
          defaultValue: 6,
        }),
      ],
    },
    {
      title: 'Layout',
      open: true,
      controls: [
        option('layout', 'layout', 'select', {
          choices: [['auto', 'auto'], ['spread', 'spread'], ['single', 'single']],
          defaultValue: 'auto',
        }),
        option('spreadQuery', 'spreadQuery', 'text', { defaultValue: DEFAULT_SPREAD_QUERY }),
        option('loop', 'loop', 'toggle', { hint: 'Single layout: restart after the last page' }),
        option('bleed', 'bleed', 'toggle'),
        option('plain', 'plain', 'toggle', { hint: 'Flat pages, no 3D', defaultValue: false }),
        option('maxPixelRatio', 'maxPixelRatio', 'range', range(0.5, 3, 0.25)),
      ],
    },
    {
      title: 'Paper',
      controls: [
        {
          label: 'grain',
          hint: 'Built-in, off, or a custom canvas',
          kind: 'select',
          choices: [['on', 'on'], ['off', 'off'], ['custom (coarse)', 'coarse']],
          read: () => state.grain,
          write: (v) => (state.grain = v as Grain | undefined),
          fallback: () => 'on',
        },
        option('paper.grainScale', 'grainScale', 'range', range(0.2, 5, 0.01)),
        option('paper.grainStrength', 'grainStrength', 'range', range(0, 0.6, 0.01)),
        option('paper.showThrough', 'showThrough', 'range', range(0, 0.6, 0.01)),
        option('paper.inkGloss', 'inkGloss', 'range', range(0, 1, 0.01)),
        option('paper.roughness', 'roughness', 'range', range(0, 1, 0.01)),
        option('paper.metalness', 'metalness', 'range', range(0, 1, 0.01)),
        option('paper.backColor', 'backColor', 'color', { hint: 'Back of single-layout pages' }),
        option('paper.wrinkles', 'wrinkles', 'range', range(0, 3, 0.05)),
        option('paper.bulge', 'bulge', 'range', range(0, 3, 0.05)),
      ],
    },
    {
      title: 'Lighting',
      controls: [
        option('lighting.ambient.sky', 'ambient.sky', 'color'),
        option('lighting.ambient.ground', 'ambient.ground', 'color'),
        option('lighting.ambient.intensity', 'ambient.intensity', 'range', range(0, 4, 0.05)),
        option('lighting.sun.color', 'sun.color', 'color'),
        option('lighting.sun.intensity', 'sun.intensity', 'range', range(0, 6, 0.05)),
        option('lighting.sun.position', 'sun.position', 'vec3', range(-6, 6, 0.1)),
        option('lighting.shadows', 'shadows', 'toggle'),
        option('lighting.shadowMapSize', 'shadowMapSize', 'select', {
          choices: [['512', 512], ['1024', 1024], ['2048', 2048], ['4096', 4096]],
        }),
        option('lighting.floorShadow', 'floorShadow', 'range', range(0, 0.6, 0.01)),
      ],
    },
    {
      title: 'Motion',
      controls: [
        option('motion.speed', 'speed', 'range', range(0.1, 4, 0.05)),
        option('motion.dragDistance', 'dragDistance', 'range', range(0.2, 2, 0.05)),
        option('motion.commitThreshold', 'commitThreshold', 'range', range(0, 0.6, 0.01)),
        option('motion.curl', 'curl', 'range', range(0, 2, 0.05)),
        option('motion.maxTilt', 'maxTilt', 'range', range(0, 80, 1)),
        option('motion.jitter', 'jitter', 'toggle'),
        option('motion.hoverLift', 'hoverLift', 'range', range(0, 0.15, 0.005)),
        option('motion.reducedMotion', 'reducedMotion', 'select', {
          choices: [['auto', 'auto'], ['true', true], ['false', false]],
          defaultValue: 'auto',
        }),
      ],
    },
    {
      title: 'Interaction',
      controls: [
        option('interaction.drag', 'drag', 'toggle'),
        option('interaction.click', 'click', 'toggle'),
        option('interaction.hold', 'hold', 'toggle'),
        option('interaction.hover', 'hover', 'toggle'),
        option('interaction.keyboard', 'keyboard', 'select', {
          choices: [['true (on focus)', true], ['global', 'global'], ['false', false]],
        }),
      ],
    },
    {
      title: 'Accessibility',
      controls: [
        option('label', 'label', 'text', { defaultValue: 'Magazine' }),
        {
          label: 'formatPageLabel',
          hint: 'Use a custom announcement function',
          kind: 'toggle',
          read: () => state.customLabel,
          write: (v) => (state.customLabel = v as boolean | undefined),
          fallback: () => false,
        },
      ],
    },
  ]

  // --- rendering ---------------------------------------------------------------------

  container.innerHTML = ''
  container.classList.add('dev-panel')
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) => {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    if (text !== undefined) node.textContent = text
    return node
  }
  const format = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v))

  const syncs: (() => void)[] = []

  function renderControl(control: Control, parent: HTMLElement) {
    const row = el('div', { class: 'row' })
    const name = el('span', { class: 'name' }, control.label)
    if (control.hint) name.title = control.hint
    const field = el('div', { class: 'field' })
    const output = el('output')
    const reset = el('button', { class: 'reset', type: 'button', title: 'Back to the default', 'aria-label': `Reset ${control.label}` }, '↺')
    reset.onclick = () => {
      control.write(undefined)
      changed()
    }

    let sync: (value: unknown) => void
    if (control.kind === 'select') {
      const select = el('select', { 'aria-label': control.label })
      control.choices!.forEach(([text], i) => select.append(el('option', { value: String(i) }, text)))
      select.onchange = () => {
        control.write(control.choices![Number(select.value)][1])
        changed()
      }
      field.append(select)
      sync = (v) => {
        const i = control.choices!.findIndex(([, value]) => value === v)
        select.value = String(Math.max(i, 0))
      }
    } else if (control.kind === 'toggle') {
      const input = el('input', { type: 'checkbox', 'aria-label': control.label })
      input.onchange = () => {
        control.write(input.checked)
        changed()
      }
      field.append(input)
      sync = (v) => {
        input.checked = Boolean(v)
        output.textContent = String(Boolean(v))
      }
      field.append(output)
    } else if (control.kind === 'color') {
      const input = el('input', { type: 'color', 'aria-label': control.label })
      input.oninput = () => {
        control.write(input.value)
        changed()
      }
      field.append(input, output)
      sync = (v) => {
        input.value = String(v)
        output.textContent = String(v)
      }
    } else if (control.kind === 'text') {
      const input = el('input', { type: 'text', 'aria-label': control.label })
      input.onchange = () => {
        control.write(input.value)
        changed()
      }
      field.append(input)
      sync = (v) => {
        if (document.activeElement !== input) input.value = String(v ?? '')
      }
    } else if (control.kind === 'range') {
      const input = el('input', {
        type: 'range',
        min: String(control.min),
        max: String(control.max),
        step: String(control.step),
        'aria-label': control.label,
      })
      input.oninput = () => {
        control.write(Number(input.value))
        changed()
      }
      field.append(input, output)
      sync = (v) => {
        input.value = String(v)
        output.textContent = format(v)
      }
    } else {
      // vec3: three sliders
      const inputs = [0, 1, 2].map((axis) => {
        const input = el('input', {
          type: 'range',
          min: String(control.min),
          max: String(control.max),
          step: String(control.step),
          'aria-label': `${control.label} ${'xyz'[axis]}`,
        })
        input.oninput = () => {
          control.write(inputs.map((i) => Number(i.value)))
          changed()
        }
        return input
      })
      const stack = el('div', { class: 'vec3' })
      stack.append(...inputs)
      field.append(stack, output)
      sync = (v) => {
        const values = (v as number[]) ?? [0, 0, 0]
        inputs.forEach((input, i) => (input.value = String(values[i])))
        output.textContent = values.map(format).join(', ')
      }
    }

    row.append(name, field, reset)
    parent.append(row)
    syncs.push(() => {
      const value = control.read()
      row.classList.toggle('is-set', value !== undefined)
      sync(value ?? control.fallback())
    })
  }

  // methods
  const methods = el('details', { open: '' })
  methods.append(el('summary', {}, 'Methods'))
  const buttons = el('div', { class: 'buttons' })
  const call = (label: string, fn: () => unknown) => {
    const button = el('button', { type: 'button' }, label)
    button.onclick = () => {
      const result = fn()
      event(label, result === undefined ? undefined : result)
    }
    buttons.append(button)
  }
  call('prev()', () => host.handle()?.prev())
  call('next()', () => host.handle()?.next())
  const goTo = el('div', { class: 'goto' })
  const goToPage = el('input', { type: 'number', min: '0', value: '0', 'aria-label': 'goTo page' })
  const goToAnimate = el('input', { type: 'checkbox', 'aria-label': 'animate' })
  goToAnimate.checked = true
  const goToLabel = el('label')
  goToLabel.append(goToAnimate, ' animate')
  const goToButton = el('button', { type: 'button' }, 'goTo()')
  goToButton.onclick = () => {
    const page = Number(goToPage.value)
    host.handle()?.goTo(page, { animate: goToAnimate.checked })
    event(`goTo(${page}, { animate: ${goToAnimate.checked} })`)
  }
  goTo.append(goToButton, goToPage, goToLabel)
  const lifecycle = el('div', { class: 'buttons' })
  const remount = el('button', { type: 'button', title: 'dispose() and create again; startPage applies' }, 'Remount')
  remount.onclick = () => {
    event('dispose() + new')
    host.remount(buildOptions(state))
  }
  const resetAll = el('button', { type: 'button' }, 'Reset all options')
  resetAll.onclick = () => {
    state = structuredClone(INITIAL)
    changed()
  }
  lifecycle.append(remount, resetAll)
  methods.append(buttons, goTo, lifecycle)

  // properties
  const properties = el('details', { open: '' })
  properties.append(el('summary', {}, 'Properties'))
  const readout = el('dl', { class: 'readout' })
  const propertyRows = (['page', 'visiblePages', 'pageCount', 'layout'] as const).map((key) => {
    const value = el('dd')
    readout.append(el('dt', {}, key), value)
    return { key, value }
  })
  properties.append(readout)

  // events
  const events = el('details', { open: '' })
  events.append(el('summary', {}, 'Events'))
  const log = el('ol', { class: 'log' })
  events.append(log)

  // options snippet
  const code = el('details')
  code.append(el('summary', {}, 'Current options'))
  const snippet = el('pre')
  const copy = el('button', { type: 'button' }, 'Copy')
  copy.onclick = async () => {
    await navigator.clipboard?.writeText(snippet.textContent ?? '')
    copy.textContent = 'Copied'
    setTimeout(() => (copy.textContent = 'Copy'), 1200)
  }
  code.append(copy, snippet)

  container.append(methods, properties, events)
  for (const section of sections) {
    const details = el('details')
    if (section.open) details.open = true
    details.append(el('summary', {}, section.title))
    for (const control of section.controls) renderControl(control, details)
    container.append(details)
  }
  container.append(code)

  // --- behaviour ---------------------------------------------------------------------

  function event(name: string, detail?: unknown) {
    const item = el('li')
    const time = new Date().toLocaleTimeString([], { hour12: false })
    item.append(el('time', {}, time), el('strong', {}, ` ${name}`))
    if (detail !== undefined) {
      const text = detail instanceof Error ? detail.message : JSON.stringify(detail)
      item.append(el('code', {}, ` ${text.length > 140 ? text.slice(0, 140) + '…' : text}`))
    }
    log.prepend(item)
    while (log.children.length > 40) log.lastElementChild!.remove()
  }

  function snippetText() {
    const data: Record<string, unknown> = { ...state.options }
    const lines = [
      `// ${state.pageCount ?? demoPages.length} pages: image URLs with alt and text`,
      `const pages = ${JSON.stringify(pagesFor(state.pageCount ?? demoPages.length, state.source ?? 'urls'), null, 2)}`,
    ]
    if (state.grain) setPath(data, 'paper.grain', state.grain === 'coarse' ? '<your grain image>' : state.grain === 'on')
    if (state.customLabel) data.formatPageLabel = '(detail) => …'
    const body = JSON.stringify(data, null, 2)
      .replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
      .replace(/"/g, "'")
    lines.push(`new LeafThrough(element, { pages, ...${body} })`)
    return lines.join('\n')
  }

  function syncAll() {
    for (const sync of syncs) sync()
    snippet.textContent = snippetText()
  }

  function saveHash() {
    const isInitial = JSON.stringify(state) === JSON.stringify(INITIAL)
    const hash = isInitial ? '' : `#${encodeURIComponent(JSON.stringify(state))}`
    history.replaceState(null, '', location.pathname + location.search + hash)
    // carry the same setup across the framework pages
    for (const a of document.querySelectorAll<HTMLAnchorElement>('nav a[data-page]')) {
      a.href = `./${a.dataset.page}.html${hash}`
    }
  }

  function changed() {
    host.apply(buildOptions(state))
    saveHash()
    syncAll()
  }

  // properties change as pages turn and layouts switch; defaults follow the layout
  let lastLayout: Layout | undefined
  setInterval(() => {
    const handle = host.handle()
    for (const { key, value } of propertyRows) {
      const v = handle ? handle[key] : '—'
      value.textContent = Array.isArray(v) ? `[${v.join(', ')}]` : String(v)
    }
    if (handle?.layout !== lastLayout) {
      lastLayout = handle?.layout
      syncAll()
    }
  }, 250)

  saveHash()
  syncAll()
  return { options: () => buildOptions(state), event }
}
