# Changelog

All notable changes to this package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

- The built-in paper grain is drawn once per page and kept, instead of once per magazine
  (about 80 ms each on a laptop, most of a ten-booklet gallery's start), and magazines drawn
  by one renderer share its texture, freed with the last of them. It looks the same.
- The sheet geometry (64 × 88 segments, the wrinkle noise sampled three times a vertex,
  about 8 ms a magazine on a laptop and four times that on a phone) is shared by the
  magazines a renderer draws, per layout and page aspect, and freed with the last of them;
  the noise is kept per aspect for magazines on other renderers. The paper looks the same.
- A three.js `Texture` passed as a page is taken as it is: its `colorSpace`,
  `premultiplyAlpha` and `anisotropy` are left alone and it's no longer marked for upload, so
  one that's on the GPU already, or shared with your own material, isn't uploaded a second
  time. This changes documented behaviour: a texture of yours now needs `colorSpace` set to
  sRGB, and `premultiplyAlpha` if it has transparent parts, to look as before (see the
  README's note on textures).
- Pages decoded together no longer go to the GPU in one go. The pages in view and next to
  them upload as they arrive; the rest go one per frame, or more in idle time where the
  browser offers it (`requestIdleCallback`), nearest the reader first, and a page the reader
  turns to meanwhile goes at once. `update({ pages })` with a dozen preloaded pages (55 ms,
  three dropped frames) no longer hitches a magazine mid-turn. `pageload` and `onPageLoad`
  still fire per page once it's on the GPU.

## [0.1.7]

- Single layout: turning the last page with `loop` on uncovers the cover. Read pages that had
  settled flat under the pile lay newest on top, so the last page revealed one of them, and as
  the magazine shut they all crossed on the way to their closed order, the cover rising through
  the rest. They now settle in that order, the cover first, and shutting lifts them as one.
- three.js demo: plays its motion whatever the system's Reduce Motion setting, the
  magazine's hover and wobble included. The envelope reveal was skipped under the setting,
  so on a phone with it on the magazine was simply there while its turns still played,
  which looked broken.

## [0.1.6]

- `paper.sheetGap`: space between stacked sheets, in page widths, so they stay in order by
  real depth instead of touching at the spine. It follows each sheet's place in the pile
  through turns, hovers and settling, in both layouts, and the shadow passes use it too.
- `paper.depthBias`: turns the polygon offset that sorts touching sheets on or off. It no
  longer has to be overridden before each draw.
- `LeafThroughObject` now separates its sheets by default (`sheetGap` `0.0005`, `depthBias`
  off), so hidden pages no longer show through from behind, or with a small camera `near`.
  The standalone magazine looks as before. Without the bias, wrinkles nest so sheets with
  little bulge don't cross.
- `deform` (experimental, `LeafThroughObject` only): reshape the paper in your own GLSL. It
  applies to the colour, depth and distance passes alike, normals follow, its uniforms are
  read every frame, and it survives rebuilds. See
  [Reshaping the paper](https://github.com/dmtrbrl/leafthrough#reshaping-the-paper).
- `LeafThroughObject`: `lighting.shadows` changes without a rebuild, and the magazine no
  longer turns sheet shadows back on after they're switched off.
- README: how the camera's depth range affects closely stacked sheets, and the depth
  bias's limits in a scene of your own.
- Tests check that hidden artwork doesn't show through: in both layouts, from the front and
  behind, with flat, low-bulge and thick booklets, after turns and hovers, at twice the
  pixel ratio and across camera depth ranges.

## [0.1.5]

- Docs for `LeafThroughObject`: `sun.position` points towards your shadow-casting light,
  where it places the shadow a turning sheet casts by the spine (it doesn't shade the paper).
  The README also covers its hit area, touch dragging, a custom `domElement`, keyboard focus
  and what it leaves to you for accessibility.
- README links to source files open them on GitHub, also from npm.

## [0.1.4]

- `LeafThroughObject`: the magazine as a `THREE.Group` for your own three.js scene. It draws
  with your renderer, casts pointer input through your camera onto the pages wherever they
  lie, and keeps every option, method and event of `LeafThrough`. `tick()` advances it from
  your render loop, a `change` event asks for frames when you render on demand, `covers()`
  tells your own pointer handlers which presses are the magazine's, `enabled` turns its input
  off and on, and `bounds` gives its size for framing. See
  [In your own three.js scene](https://github.com/dmtrbrl/leafthrough#in-your-own-threejs-scene).
- `paper.cutout`: cuts each sheet to the shape of its front page, so transparent areas are no
  paper at all and the shadow follows the outline. Off by default.
- A three.js demo page: a magazine slides right out of a portrait paperboard mailer, with
  geometric folds, matching LeafThrough branding and one reversible reveal. Reduced motion
  skips the decorative reveal.
- Scene-object drags follow the projected page axis when the magazine is rotated. Disabling
  input releases gestures and cancels hold timers; hit testing follows the moving single-layout pile.
- Page silhouettes now match their shadows for directional, spot and point lights, including
  transparent cutouts and trimmed single-layout sheets.

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
