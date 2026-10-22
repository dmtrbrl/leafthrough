import 'leafthrough/element'
import type { LeafThroughElement } from 'leafthrough/element'
import type { LeafThroughOptions } from 'leafthrough'
import { createDevPanel } from './panel'
import './style.css'

// The panel drives <leaf-through> through its `options` property and its methods;
// events arrive as DOM events.
const stage = document.getElementById('stage')!
let element: LeafThroughElement | null = null

function create(options: LeafThroughOptions) {
  element?.remove()
  element = document.createElement('leaf-through')
  element.className = 'magazine'
  element.options = options
  element.addEventListener('pagechange', (e) => panel.event('pagechange', e.detail))
  element.addEventListener('ready', () => panel.event('ready'))
  element.addEventListener('pageerror', (e) => panel.event('pageerror', { message: String(e.detail.error), page: e.detail.page }))
  stage.append(element)
}

const panel = createDevPanel(document.getElementById('panel')!, {
  apply: (options) => element && (element.options = options),
  remount: create,
  handle: () => {
    const el = element
    if (!el?.instance) return null
    return {
      next: () => el.next(),
      prev: () => el.prev(),
      goTo: (page, options) => el.goTo(page, options),
      get page() {
        return el.page
      },
      get pageCount() {
        return el.pageCount
      },
      get layout() {
        return el.layout
      },
      get visiblePages() {
        return el.instance?.visiblePages ?? []
      },
    }
  },
})

create(panel.options())
