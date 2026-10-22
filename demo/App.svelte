<script lang="ts">
  import { leafThrough, type LeafThrough, type LeafThroughOptions } from 'leafthrough/svelte'
  import { createDevPanel } from './panel'

  // The panel drives the magazine through the action's parameters; remounting re-keys it.
  let magazine: LeafThrough | undefined
  let key = $state(0)
  let options = $state.raw<LeafThroughOptions>({ pages: [] })

  const panel = createDevPanel(document.getElementById('panel')!, {
    apply: (next) => (options = next),
    remount: (next) => {
      options = next
      key++
    },
    handle: () => magazine ?? null,
  })
  options = panel.options()
</script>

{#key key}
  <div
    class="magazine"
    use:leafThrough={{
      ...options,
      onInit: (m) => (magazine = m),
      onPageChange: (detail) => panel.event('pagechange', detail),
      onReady: () => panel.event('ready'),
      onError: (error, page) => panel.event('error', { message: String(error), page }),
    }}
  ></div>
{/key}
