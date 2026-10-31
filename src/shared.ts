import type * as THREE from 'three'

interface Entry {
  value: { dispose(): void }
  users: number
}

/**
 * Things every magazine drawn by one renderer can share: made the first time one asks, handed
 * to the rest, and freed with the last one still using them. They're kept per renderer because
 * three.js keeps a GPU copy of a texture or geometry, and a dispose listener on it, for each
 * renderer that draws it; shared across renderers, it would keep hold of every renderer that
 * ever drew it until the last magazine anywhere let it go.
 */
export class SharedResources {
  private readonly entries = new Map<string, Entry>()

  /** The resource under `key`, made by `make` for the first user. Pair every call with `release`. */
  acquire<T extends { dispose(): void }>(key: string, make: () => T): T {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { value: make(), users: 0 }
      this.entries.set(key, entry)
    }
    entry.users++
    return entry.value as T
  }

  /** Lets go of `key`; the last user's release frees it. */
  release(key: string) {
    const entry = this.entries.get(key)
    if (!entry || --entry.users > 0) return
    this.entries.delete(key)
    entry.value.dispose()
  }
}

const byRenderer = new WeakMap<THREE.WebGLRenderer, SharedResources>()

/** What the magazines drawn by `renderer` share. */
export function sharedResources(renderer: THREE.WebGLRenderer): SharedResources {
  let shared = byRenderer.get(renderer)
  if (!shared) {
    shared = new SharedResources()
    byRenderer.set(renderer, shared)
  }
  return shared
}
