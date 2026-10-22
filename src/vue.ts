import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType } from 'vue'
import { LeafThrough as Magazine, type GoToOptions } from './LeafThrough.js'
import type {
  LeafThroughOptions,
  InteractionOptions,
  LightingOptions,
  MotionOptions,
  PageChangeDetail,
  PageSource,
  PaperOptions,
} from './options.js'

export type * from './options.js'

/**
 * Vue 3 component. Give it a size with a class or style; without a height it takes its
 * height from its width. Exposes `next()`, `prev()`, `goTo()` and `instance` via a template ref.
 *
 * ```vue
 * <LeafThrough :pages="pages" style="height: 80vh" @pagechange="(d) => (page = d.page)" />
 * ```
 */
export const LeafThrough = defineComponent({
  name: 'LeafThrough',
  props: {
    pages: { type: Array as PropType<PageSource[]>, required: true },
    startPage: Number,
    layout: String as PropType<LeafThroughOptions['layout']>,
    spreadQuery: String,
    pageAspect: Number,
    loop: { type: Boolean, default: undefined },
    bleed: { type: Boolean, default: undefined },
    paper: Object as PropType<PaperOptions>,
    lighting: Object as PropType<LightingOptions>,
    motion: Object as PropType<MotionOptions>,
    interaction: Object as PropType<InteractionOptions>,
    maxPixelRatio: Number,
    label: String,
    formatPageLabel: Function as PropType<LeafThroughOptions['formatPageLabel']>,
  },
  emits: {
    pagechange: (_detail: PageChangeDetail) => true,
    ready: () => true,
    error: (_error: unknown, _page?: number) => true,
  },
  setup(props, { emit, expose }) {
    const element = ref<HTMLDivElement>()
    const instance = shallowRef<Magazine | null>(null)

    const events = {
      onPageChange: (detail: PageChangeDetail) => emit('pagechange', detail),
      onReady: () => emit('ready'),
      onError: (error: unknown, page?: number) => emit('error', error, page),
    }
    // every prop, set or not: unset ones fall back to the magazine's defaults
    const options = (): LeafThroughOptions => ({ ...(props as unknown as LeafThroughOptions), ...events })

    onMounted(() => {
      instance.value = new Magazine(element.value!, options())
    })
    // compared by value, so only real changes rebuild anything
    watch(options, (next) => instance.value?.setOptions(next), { deep: true })
    onBeforeUnmount(() => {
      instance.value?.dispose()
      instance.value = null
    })

    expose({
      next: () => instance.value?.next() ?? false,
      prev: () => instance.value?.prev() ?? false,
      goTo: (page: number, goToOptions?: GoToOptions) => instance.value?.goTo(page, goToOptions),
      instance,
    })

    return () => h('div', { ref: element })
  },
})

export default LeafThrough
