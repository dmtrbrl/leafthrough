import { LeafThrough, type LeafThroughOptions } from 'leafthrough'
import { createDevPanel } from './panel'
import './style.css'

const element = document.createElement('div')
element.className = 'magazine'
document.getElementById('stage')!.append(element)

let magazine: LeafThrough | null = null

const panel = createDevPanel(document.getElementById('panel')!, {
  apply: (options) => magazine?.setOptions(withEvents(options)),
  remount: (options) => {
    magazine?.dispose()
    magazine = new LeafThrough(element, withEvents(options))
  },
  handle: () => magazine,
})

function withEvents(options: LeafThroughOptions): LeafThroughOptions {
  return {
    ...options,
    onPageChange: (detail) => panel.event('pagechange', detail),
    onReady: () => panel.event('ready'),
    onPageLoad: (page) => panel.event('pageload', { page }),
    onError: (error, page) => panel.event('error', { message: String(error), page }),
  }
}

magazine = new LeafThrough(element, withEvents(panel.options()))
if (import.meta.env.DEV) Object.assign(window, { magazine: () => magazine })
