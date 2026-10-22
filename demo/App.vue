<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { LeafThrough, type LeafThroughOptions } from 'leafthrough/vue'
import { createDevPanel, type MagazineHandle } from './panel'

// The panel drives the component through its props, and its methods through the
// template ref; events arrive as Vue events.
interface Exposed {
  next(): boolean
  prev(): boolean
  goTo(page: number, options?: { animate?: boolean }): void
  instance: MagazineHandle | null
}
const magazine = ref<Exposed>()
const key = ref(0)

const panel = createDevPanel(document.getElementById('panel')!, {
  apply: (next) => (options.value = next),
  remount: (next) => {
    options.value = next
    key.value++
  },
  handle: (): MagazineHandle | null => {
    const exposed = magazine.value
    const instance = exposed?.instance
    if (!exposed || !instance) return null
    return {
      next: () => exposed.next(),
      prev: () => exposed.prev(),
      goTo: (page, goToOptions) => exposed.goTo(page, goToOptions),
      get page() {
        return instance.page
      },
      get pageCount() {
        return instance.pageCount
      },
      get visiblePages() {
        return instance.visiblePages
      },
      get layout() {
        return instance.layout
      },
    }
  },
})
const options = shallowRef<LeafThroughOptions>(panel.options())
</script>

<template>
  <LeafThrough
    :key="key"
    ref="magazine"
    class="magazine"
    v-bind="options"
    @pagechange="(detail) => panel.event('pagechange', detail)"
    @ready="() => panel.event('ready')"
    @error="(error, page) => panel.event('error', { message: String(error), page })"
  />
</template>
