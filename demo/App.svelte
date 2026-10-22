<script lang="ts">
  import { foldable, type FoldableMagazine, type Layout } from 'foldable-magazine/svelte'
  import { generatePages } from './pages'

  const pages = generatePages()
  let magazine: FoldableMagazine | undefined
  let visible = $state<number[]>([13, 14])
  let layout = $state<'auto' | Layout>('auto')
  let grain = $state(true)
</script>

<main>
  <div
    class="magazine"
    use:foldable={{
      pages,
      startPage: 14,
      layout,
      paper: { grain },
      interaction: { keyboard: 'global' },
      onInit: (m) => (magazine = m),
      onPageChange: (detail) => (visible = detail.visiblePages),
    }}
  ></div>
</main>
<footer>
  <div class="controls">
    <button onclick={() => magazine?.prev()}>← Prev</button>
    <button onclick={() => magazine?.next()}>Next →</button>
    <button onclick={() => magazine?.goTo(0, { animate: true })}>Riffle to cover</button>
    <span class="status" id="status">{visible.map((p) => p + 1).join('–') || 'closed'} / {pages.length}</span>
  </div>
  <div class="controls">
    <label>
      Layout
      <select bind:value={layout}>
        <option>auto</option>
        <option>spread</option>
        <option>single</option>
      </select>
    </label>
    <label><input type="checkbox" bind:checked={grain} /> Grain</label>
  </div>
</footer>
