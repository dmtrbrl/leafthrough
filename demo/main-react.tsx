import { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FoldableMagazine, type FoldableMagazineHandle, type Layout } from 'foldable-magazine/react'
import { generatePages } from './pages'
import './style.css'

function App() {
  const pages = useMemo(() => generatePages(), [])
  const magazine = useRef<FoldableMagazineHandle>(null)
  const [visible, setVisible] = useState<number[]>([13, 14])
  const [layout, setLayout] = useState<'auto' | Layout>('auto')
  const [grain, setGrain] = useState(true)

  return (
    <>
      <main>
        <FoldableMagazine
          ref={magazine}
          className="magazine"
          pages={pages}
          startPage={14}
          layout={layout}
          paper={{ grain }}
          interaction={{ keyboard: 'global' }}
          onPageChange={(detail) => setVisible(detail.visiblePages)}
        />
      </main>
      <footer>
        <div className="controls">
          <button onClick={() => magazine.current?.prev()}>← Prev</button>
          <button onClick={() => magazine.current?.next()}>Next →</button>
          <button onClick={() => magazine.current?.goTo(0, { animate: true })}>Riffle to cover</button>
          <span className="status" id="status">
            {visible.map((p) => p + 1).join('–') || 'closed'} / {pages.length}
          </span>
        </div>
        <div className="controls">
          <label>
            Layout{' '}
            <select value={layout} onChange={(e) => setLayout(e.target.value as 'auto' | Layout)}>
              <option>auto</option>
              <option>spread</option>
              <option>single</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={grain} onChange={(e) => setGrain(e.target.checked)} /> Grain
          </label>
        </div>
      </footer>
    </>
  )
}

createRoot(document.getElementById('app')!).render(<App />)
