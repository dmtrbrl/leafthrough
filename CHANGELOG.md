# Changelog

All notable changes to this package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

- `turning`: true while a page is being dragged or is still finishing its turn.
- Single layout: magazines shorter than about 24 pages now close after the last page without
  the pile jumping up, and the roll is fully open and even on the last page, as in longer ones.
- A looping magazine keeps the cover loaded near the last page, so it doesn't come back blank.
- A container scaled with a CSS transform no longer crops turning pages at the screen's edge.
- Single layout: nothing shows past the right or bottom edge of the page in view; pages under
  it, or settling back under the pile, used to show a sliver of their print there.
- The built-in paper grain is a fine, even speckle, closer to printed paper, instead of a
  cloudy one.

## [0.1.0]

First release.

- `spread` and `single` layouts, with `auto` choosing between them by media query.
- Drag, click, press and hold, and keyboard navigation.
- Paper, lighting, motion and interaction options.
- React, Vue and Svelte bindings and the `<leaf-through>` Web Component.
- Keyboard control, page announcements and reduced motion support.
- Pages as `{ src, alt, text }`, with the visible pages' descriptions and text kept in the
  page for screen readers.
- A plain view without 3D (`plain`), used by itself when the browser can't run WebGL.
- Loading that follows the reader: nearest pages first, distant ones unloaded (`preload`),
  requests no longer needed aborted, `retry()` and the `pageload` event.
- Tested with three.js r160 to r186, React 18 and 19, Vue 3.3 to 3.5, and Svelte 4 and 5.
