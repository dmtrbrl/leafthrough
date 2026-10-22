<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { LeafThrough, type Layout, type PageChangeDetail } from 'leafthrough/vue'
import { generatePages } from './pages'

const pages = shallowRef(generatePages())
const magazine = ref<InstanceType<typeof LeafThrough> & { next(): boolean; prev(): boolean; goTo(page: number, o?: { animate?: boolean }): void }>()
const visible = ref<number[]>([13, 14])
const layout = ref<'auto' | Layout>('auto')
const grain = ref(true)

const onPageChange = (detail: PageChangeDetail) => (visible.value = detail.visiblePages)
</script>

<template>
  <main>
    <LeafThrough
      ref="magazine"
      class="magazine"
      :pages="pages"
      :start-page="14"
      :layout="layout"
      :paper="{ grain }"
      :interaction="{ keyboard: 'global' }"
      @pagechange="onPageChange"
    />
  </main>
  <footer>
    <div class="controls">
      <button @click="magazine?.prev()">← Prev</button>
      <button @click="magazine?.next()">Next →</button>
      <button @click="magazine?.goTo(0, { animate: true })">Riffle to cover</button>
      <span class="status" id="status">{{ visible.map((p) => p + 1).join('–') || 'closed' }} / {{ pages.length }}</span>
    </div>
    <div class="controls">
      <label>
        Layout
        <select v-model="layout">
          <option>auto</option>
          <option>spread</option>
          <option>single</option>
        </select>
      </label>
      <label><input v-model="grain" type="checkbox" /> Grain</label>
    </div>
  </footer>
</template>
