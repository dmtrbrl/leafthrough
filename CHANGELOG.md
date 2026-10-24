# Changelog

All notable changes to this package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3]

- Reduced motion is gentler: it drops the decorative motion (the hover lift and the random
  wobble between turns) and no longer speeds turns up 2.5× or turns off press and hold, which
  made the magazine feel broken to people with Reduce Motion on.

## [0.1.2]

- `maxPixelRatio` defaults to `3` instead of `2`, so pages are drawn at full sharpness on
  3× phone screens. Set it back to `2` to draw fewer pixels on those screens.

## [0.1.1]

- Pages still turning in a quick riffle no longer unload and show blank paper. Loading now
  follows what's on screen, not just the page being read, which mattered in magazines of more
  than about a dozen pages.
- Single layout: turning pages back quickly no longer hides the pile under them, which let the
  floor or the cover show through where the current page should be.
- Single layout: read pages rolled up behind the magazine stay loaded until they settle under
  the pile, so their corners don't turn to blank paper.
- Of the pages on screen, the one being read loads first.
- `preload` counts from every page on screen, mid-turn and rolled-up ones included.

## [0.1.0]

First release.

- `spread` and `single` layouts, with `auto` choosing between them by media query.
- Drag, click, press and hold, and keyboard navigation.
- `turning`, true while a page is being dragged or is still finishing its turn.
- Paper, lighting, motion and interaction options.
- React, Vue and Svelte bindings and the `<leaf-through>` Web Component.
- Keyboard control, page announcements and reduced motion support.
- Pages as `{ src, alt, text }`, with the visible pages' descriptions and text kept in the
  page for screen readers.
- A plain view without 3D (`plain`), used by itself when the browser can't run WebGL.
- Loading that follows the reader: nearest pages first, distant ones unloaded (`preload`),
  requests no longer needed aborted, `retry()` and the `pageload` event.
- Tested with three.js r160 to r186, React 18 and 19, Vue 3.3 to 3.5, and Svelte 4 and 5.
