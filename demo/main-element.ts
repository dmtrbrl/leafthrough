import 'foldable-magazine/element'
import type { FoldableMagazineElement } from 'foldable-magazine/element'
import { generatePages } from './pages'
import './style.css'

// Plain HTML: attributes for the simple options, the `pages` property for canvases (a
// list of <img> children or a `pages` attribute with URLs works too).
document.querySelector('#app')!.innerHTML = `
  <main>
    <foldable-magazine class="magazine" start-page="14" keyboard="global" label="Foldable, issue 01"></foldable-magazine>
  </main>
  <footer>
    <div class="controls">
      <button id="prev">← Prev</button>
      <button id="next">Next →</button>
      <span class="status" id="status"></span>
    </div>
    <div class="controls">
      <label>Layout <select id="layout"><option>auto</option><option>spread</option><option>single</option></select></label>
    </div>
  </footer>
`

const magazine = document.querySelector('foldable-magazine') as FoldableMagazineElement
const status = document.getElementById('status')!
magazine.pages = generatePages()
magazine.addEventListener('pagechange', (e) => {
  const { visiblePages, pageCount } = (e as CustomEvent).detail
  status.textContent = `${visiblePages.map((p: number) => p + 1).join('–') || 'closed'} / ${pageCount}`
})
document.getElementById('prev')!.onclick = () => magazine.prev()
document.getElementById('next')!.onclick = () => magazine.next()
document.getElementById('layout')!.onchange = (e) => magazine.setAttribute('layout', (e.target as HTMLSelectElement).value)
