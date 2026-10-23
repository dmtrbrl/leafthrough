import { createRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LeafThrough, type LeafThroughHandle, type LeafThroughOptions } from 'leafthrough/react'
import { createDevPanel, type MagazineHandle } from './panel'
import './style.css'

// The panel drives the component through its props, and its methods through the ref.
const magazine = createRef<LeafThroughHandle>()
let setOptions: (options: LeafThroughOptions) => void = () => {}
let remount: (options: LeafThroughOptions) => void = () => {}

const panel = createDevPanel(document.getElementById('panel')!, {
  apply: (options) => setOptions(options),
  remount: (options) => remount(options),
  handle: (): MagazineHandle | null => {
    const handle = magazine.current
    if (!handle) return null
    return {
      next: () => handle.next(),
      prev: () => handle.prev(),
      goTo: (page, options) => handle.goTo(page, options),
      get page() {
        return handle.page
      },
      get pageCount() {
        return handle.pageCount
      },
      get visiblePages() {
        return handle.instance?.visiblePages ?? []
      },
      get layout() {
        return handle.instance?.layout
      },
    }
  },
})

function App() {
  const [options, set] = useState(panel.options)
  const [key, setKey] = useState(0)
  setOptions = set
  remount = (next) => {
    set(next)
    setKey((k) => k + 1)
  }
  return (
    <LeafThrough
      key={key}
      ref={magazine}
      className="magazine"
      {...options}
      onPageChange={(detail) => panel.event('pagechange', detail)}
      onReady={() => panel.event('ready')}
      onPageLoad={(page) => panel.event('pageload', { page })}
      onError={(error, page) => panel.event('error', { message: String(error), page })}
    />
  )
}

createRoot(document.getElementById('stage')!).render(<App />)
