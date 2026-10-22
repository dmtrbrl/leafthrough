import { LeafThrough, type LeafThroughOptions } from 'leafthrough'
import { generatePages } from './pages'
import './style.css'

document.querySelector('#app')!.innerHTML = `
  <main><div class="magazine" id="magazine"></div></main>
  <footer>
    <div class="controls">
      <button id="prev">← Prev</button>
      <button id="next">Next →</button>
      <button id="cover">Riffle to cover</button>
      <span class="status" id="status"></span>
    </div>
    <div class="controls">
      <label>Layout <select id="layout"><option>auto</option><option>spread</option><option>single</option></select></label>
      <label><input type="checkbox" id="grain" checked /> Grain</label>
      <label>Speed <select id="speed"><option>0.5</option><option selected>1</option><option>2</option></select></label>
    </div>
  </footer>
`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const status = $('status')

const magazine = new LeafThrough($('magazine'), {
  pages: generatePages(),
  startPage: 14,
  label: 'Foldable, issue 01',
  interaction: { keyboard: 'global' },
  onPageChange: ({ visiblePages, pageCount }) => {
    status.textContent = `${visiblePages.map((p) => p + 1).join('–') || 'closed'} / ${pageCount}`
  },
})
status.textContent = `${magazine.visiblePages.map((p) => p + 1).join('–')} / ${magazine.pageCount}`

$('prev').onclick = () => magazine.prev()
$('next').onclick = () => magazine.next()
$('cover').onclick = () => magazine.goTo(0, { animate: true })
$<HTMLSelectElement>('layout').onchange = (e) =>
  magazine.update({ layout: (e.target as HTMLSelectElement).value as LeafThroughOptions['layout'] })
$<HTMLInputElement>('grain').onchange = (e) => magazine.update({ paper: { grain: (e.target as HTMLInputElement).checked } })
$<HTMLSelectElement>('speed').onchange = (e) =>
  magazine.update({ motion: { speed: Number((e.target as HTMLSelectElement).value) } })

if (import.meta.env.DEV) Object.assign(window, { magazine })
