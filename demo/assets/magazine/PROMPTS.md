# LeafThrough — final magazine prompts

This is the single consolidated specification for the approved twelve-page pastel magazine. It incorporates the accepted collage direction, copy corrections, clean covers, lighter dark spreads, ivory pencil marks, and exact header/footer alignment. It is a reusable final brief, not a chronological transcript of rejected variations.

The accompanying PNGs are the authoritative finished artwork. The artwork was generated/edited with the built-in image tool; final header/footer alignment was applied programmatically. Prompts alone do not guarantee identical images or exact pixel placement.

## How to use

Combine the shared art-direction prompt, the appropriate page treatment, and one page brief below. Generate one complete portrait page at a time, using the corresponding final PNG as the visual reference when available. Then apply the exact alignment specification below offline and export a single complete PNG per page. The demo consumes those PNGs directly; there are no separate runtime artwork or text layers.

## Shared art-direction prompt

Create one finished flat page for LeafThrough, a contemporary art-and-design magazine about images, texture, motion, and a 3D page-flipping library. Use sophisticated analog photographic collage: grayscale photographic cutouts, precise silhouettes, torn paper fibers, gentle print grain, and restrained pencil arcs and scribbles. Use cream #FAF3F0, sage #D4E2D4, blush #FFCACC, lavender #DBC4F0, charcoal type, and grayscale photographs. Keep colors muted.

Preserve varied, asymmetrical compositions and the balance of large artwork with integrated text. Alternate art-led and text-led pages. Text may overlap or sit on torn-paper shapes. Use the approved original bold proportional sans-serif heading style and regular sans-serif body text. Keep a coherent typographic scale, while allowing title positions, line breaks, text columns, and artwork arrangements to vary. Keep all content inside the page and leave breathing room around the composition.

When editing an approved page, preserve its photographic subjects, artwork scale, relative arrangement, main title placement, and copy. Do not turn every page into the same grid, shrink the collage, or replace the original type with SF Mono. Artwork and text must be exported together in one image.

No device screens, UI mockups, literal flipbooks, page curls, visible book spines, comic characters, watermarks, or invented extra copy. Spell LeafThrough exactly. Use the exact page copy specified below.

## Page treatments

- Pages 2, 3, 6, 7, 10, and 11: genuine transparent background and margins, charcoal text and pencil marks. No opaque full-page cream rectangle.
- Pages 4–5 and 8–9: opaque softer charcoal paper, target #414047, across the entire canvas. Use warm ivory #FAF3F0 for text and decorative pencil marks over dark paper. Keep text on pale cutouts charcoal. Preserve photographic stems, rails, and shadows; only decorative pencil marks become ivory. Keep pastel collage colors unchanged.
- Pages 1 and 12: transparent covers with their own cover copy. No running header or numbered footer. The front cover retains ISSUE 01.
- Reading order: page 1 is the front cover; 2–3, 4–5, 6–7, 8–9, and 10–11 are facing spreads; page 12 is the back cover.

## Exact final alignment — apply programmatically

All interior images use a 1068 × 1472 pixel canvas. Coordinates are measured from the top-left corner. Do not rely on generation to position these elements exactly.

| Element | Final geometry |
| --- | --- |
| Running header background | x=108, y=90, width=412, height=44; cream #FAF3F0 |
| Contents-page header exception | Page 2 uses x=548; identical y, width, height, and typography |
| Header lettering | “LeafThrough / Studies in motion”; x=header x+18, y=102, width=376, height=20 |
| Footer rule | x=108, y=1390, width=852, height=2 |
| Footer brand | “LEAFTHROUGH”; left edge x=108, top y=1410, glyph height=17 |
| Footer page number | Two digits; right edge x=960, top y=1410, glyph height=17 |
| Footer color | #26262A on light pages; #FAF3F0 on dark pages |

Reuse the approved page-six header lettering and footer brand for consistency, scaling once to these fixed dimensions. Keep page numbers at the same height. Remove old running headers and footers completely before placing the shared versions. Restore transparency on light pages and the surrounding charcoal paper on dark pages. Do not move the main titles, body text, or collages to enforce this alignment. Covers are excluded.

Validate identical header edges, footer rules, and label positions across every facing spread. Verify that pixels outside the edited furniture areas remain unchanged relative to the source normalized to the common canvas. Keep each result as a complete PNG. `alignment.json` records the final coordinates for every interior page.

## Page-specific prompts and copy

### 01-cover.png

Clean transparent cover; no running header, footer rule, footer brand or page number.

Cover. Huge elegant charcoal sans-serif masthead 'LeafThrough' split over two lines only if necessary, exact capitalization. Small top label 'ISSUE 01'. Main collage: grayscale mountain ridge cutout, lavender disk, sage rectangle, torn blush strip and tiny charcoal drawn orbit. Restrained asymmetrical editorial cover. Bottom cover line 'A study in pages, texture and motion.'

### 02-contents.png

Light page with genuine transparent background; charcoal pencil marks and text.

Contents page, typography-led asymmetrical two-column grid. Heading 'Inside this issue'. Exact index text: '03 / A page in motion', '04 / Room to breathe', '05 / The shape of a turn', '06 / Under the surface', '07 / Soft geometry', '08 / One idea, many frameworks', '09 / Layers of light', '10 / A sequence of images', '11 / Keep exploring'. Small bottom collage of grayscale leaf and torn lavender square. Small introduction: 'LeafThrough explores a familiar gesture in a digital space. A collection of images becomes something you can move through, one page at a time.' Add a tall grayscale window photograph and delicate flowering branch on the left; keep the contents list on the right and a leaf/lake collage at the bottom.

### 03-motion.png

Light page with genuine transparent background; charcoal pencil marks and text.

Art-led page. Heading 'A page in motion'. Dominant surreal collage grayscale ocean wave cutout intersected by large flat blush disk and sage vertical strip; lavender torn paper sliver, one fine looping pencil line. Caption 'A small gesture changes the view. The next image waits just beyond the edge.'

### 04-space.png

Opaque softer charcoal page; ivory pencil marks and text over dark paper.

Editorial text page, bold heading 'Room to breathe', two spacious columns and small abstract botanical photo fragment in upper right over sage torn paper. Exact body divided into two paragraphs: 'Margins are part of the composition. They give an image room to settle and leave space for the reader to look. A page can be quiet without being empty.' and 'In LeafThrough, the artwork lives on the page while the page moves through space. Keeping the layout simple lets both the image and the motion have their moment.' Pull quote on blush strip: 'Space is part of the page.' Include a larger grayscale botanical collage near the bottom, with lavender paper and ivory pencil loops. Keep the two text columns integrated with the collage.

### 05-shape.png

Opaque softer charcoal page; ivory pencil marks and text over dark paper.

Art-led page with heading 'The shape of a turn'. Large grayscale architectural spiral stair fragment, carefully cut out, layered over lavender rectangle and pale sage circle. A small blush torn-paper block gives balance. No literal book or paper curl. Caption 'An arc, a change of angle, a new perspective. Motion connects one composition to the next.'

### 06-surface.png

Light page with genuine transparent background; charcoal pencil marks and text.

Text-led editorial page. Large heading 'Under the surface'. Two columns with exact prose: 'A flat image becomes a surface in three dimensions. Light, shadow and changing perspective give the turn its sense of depth.' and 'LeafThrough uses Three.js to bring that surface into the browser. The image supplies the design; the library supplies the movement.' Large lavender and sage torn geometric collage with grayscale stone texture lower right. Large pull quote 'Flat artwork. A spatial experience.'

### 07-geometry.png

Light page with genuine transparent background; charcoal pencil marks and text.

Visual essay page, heading 'Soft geometry'. Big grayscale seashell photographic cutout with its natural spiral, overlapping blush rectangle, lavender semicircle and torn sage strip. Fine charcoal hand-drawn arc, soft analog print texture. Small caption 'Hard edges meet softness. A visual pause between one turn and the next.' Body: 'Nature composes with simple shapes, repeated and refined over time. Curves hold memory, turning structure into something gentle. In the space between form and feeling, geometry finds a softer side.' Place this body beside the shell, with the short caption near the lower right.

### 08-frameworks.png

Opaque softer charcoal page; ivory pencil marks and text over dark paper.

Typography-led editorial page. Heading 'One idea, many frameworks'. A graceful grid of four large typeset names: 'React', 'Vue', 'Svelte', 'Web Components'. No logos or UI. Body: 'Different projects begin in different places. The page-turning experience can remain familiar across them.' Second short body: 'LeafThrough keeps the focus on the pages: choose the images, place the component, and make room for the content.' Lower narrow collage: four grayscale botanical cutouts over irregular pastel blocks. Refined magazine design, not a software advertisement. Add a torn grayscale landscape photograph beside the text. Keep the four framework names beneath their botanical cutouts.

### 09-light.png

Opaque softer charcoal page; ivory pencil marks and text over dark paper.

Art-led page. Heading 'Layers of light'. Surreal grayscale cloud cutout floating above a grayscale mountain peak, lavender disk behind, torn cream paper, pale blush strip and sage block. Lots of open space. Caption 'An image is still. Its relationship to light and space can change.'

### 10-images.png

Light page with genuine transparent background; charcoal pencil marks and text.

Editorial text page heading 'A sequence of images'. Two generous columns. Exact body: 'A magazine is more than a collection of pictures. Scale, contrast and pacing make each page feel connected to the next.' and 'LeafThrough begins with an array of image URLs. Mix a bold opening, a quiet composition and a page of type. The sequence gives the experience its rhythm.' Large staggered collage of three flat grayscale photo fragments: water, leaf, mountain; pastel torn squares behind. Pull quote 'Choose the images. Find the rhythm.'

### 11-explore.png

Light page with genuine transparent background; charcoal pencil marks and text.

Art-led closing feature. Large heading 'Keep exploring'. Collage of grayscale open doorway architectural cutout with a distant mountain visible inside, sage block, blush torn strip, lavender circle. No person. Short text 'A portfolio, a visual journal, a small collection of ideas. There is always another way to leaf through.'

### 12-back.png

Clean transparent cover; no running header, footer rule, footer brand or page number.

Minimal back cover. Large title 'LeafThrough'. Subheading 'Turn a page. See what follows.' Single restrained grayscale leaf cutout floating over a lavender circle and small torn blush and sage paper pieces. Lower small text 'Pages, texture and motion.' Quiet elegant ending, huge negative space.
