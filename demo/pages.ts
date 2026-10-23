import type { PageDescriptor } from "leafthrough";

// Twelve LeafThrough magazine image pages in reading order, each with a description and
// its printed text for screen readers and the plain view (the copy is in PROMPTS.md).
// Vite resolves these asset URLs for local development and subpath deployments.
const page = (file: string, alt: string, text: string): PageDescriptor => ({
  src: new URL(`./assets/magazine/${file}`, import.meta.url).href,
  alt,
  text,
});

export const demoPages: PageDescriptor[] = [
  page(
    "01-cover.png",
    "Cover: a grayscale mountain ridge collaged with a lavender disk, a sage rectangle and a torn blush strip.",
    "LeafThrough. Issue 01.\n\nA study in pages, texture and motion.",
  ),
  page(
    "02-contents.png",
    "Contents page beside a tall window photograph and a flowering branch, with a leaf and lake collage below.",
    "Inside this issue. 03 A page in motion. 04 Room to breathe. 05 The shape of a turn. 06 Under the surface. 07 Soft geometry. 08 One idea, many frameworks. 09 Layers of light. 10 A sequence of images. 11 Keep exploring.\n\nLeafThrough explores a familiar gesture in a digital space. A collection of images becomes something you can move through, one page at a time.",
  ),
  page(
    "03-motion.png",
    "A grayscale ocean wave cut through by a blush disk and a sage strip.",
    "A page in motion.\n\nA small gesture changes the view. The next image waits just beyond the edge.",
  ),
  page(
    "04-space.png",
    "Dark page with two text columns and a grayscale botanical collage on sage and lavender paper.",
    "Room to breathe.\n\nMargins are part of the composition. They give an image room to settle and leave space for the reader to look. A page can be quiet without being empty.\n\nIn LeafThrough, the artwork lives on the page while the page moves through space. Keeping the layout simple lets both the image and the motion have their moment.\n\nSpace is part of the page.",
  ),
  page(
    "05-shape.png",
    "Dark page with a grayscale spiral staircase over a lavender rectangle and a pale sage circle.",
    "The shape of a turn.\n\nAn arc, a change of angle, a new perspective. Motion connects one composition to the next.",
  ),
  page(
    "06-surface.png",
    "Text page with a torn lavender and sage collage and a grayscale stone texture.",
    "Under the surface.\n\nA flat image becomes a surface in three dimensions. Light, shadow and changing perspective give the turn its sense of depth.\n\nLeafThrough uses Three.js to bring that surface into the browser. The image supplies the design; the library supplies the movement.\n\nFlat artwork. A spatial experience.",
  ),
  page(
    "07-geometry.png",
    "A grayscale seashell spiral overlapping a blush rectangle, a lavender semicircle and a sage strip.",
    "Soft geometry.\n\nNature composes with simple shapes, repeated and refined over time. Curves hold memory, turning structure into something gentle. In the space between form and feeling, geometry finds a softer side.\n\nHard edges meet softness. A visual pause between one turn and the next.",
  ),
  page(
    "08-frameworks.png",
    "Dark page with four framework names set beneath grayscale botanical cutouts, beside a torn landscape photograph.",
    "One idea, many frameworks. React. Vue. Svelte. Web Components.\n\nDifferent projects begin in different places. The page-turning experience can remain familiar across them.\n\nLeafThrough keeps the focus on the pages: choose the images, place the component, and make room for the content.",
  ),
  page(
    "09-light.png",
    "Dark page with a grayscale cloud floating above a mountain peak, a lavender disk behind.",
    "Layers of light.\n\nAn image is still. Its relationship to light and space can change.",
  ),
  page(
    "10-images.png",
    "Text page with staggered grayscale photographs of water, a leaf and a mountain on pastel squares.",
    "A sequence of images.\n\nA magazine is more than a collection of pictures. Scale, contrast and pacing make each page feel connected to the next.\n\nLeafThrough begins with an array of image URLs. Mix a bold opening, a quiet composition and a page of type. The sequence gives the experience its rhythm.\n\nChoose the images. Find the rhythm.",
  ),
  page(
    "11-explore.png",
    "A grayscale open doorway with a distant mountain inside, among sage, blush and lavender shapes.",
    "Keep exploring.\n\nA portfolio, a visual journal, a small collection of ideas. There is always another way to leaf through.",
  ),
  page(
    "12-back.png",
    "Back cover: a single grayscale leaf over a lavender circle.",
    "LeafThrough. Turn a page. See what follows.\n\nPages, texture and motion.",
  ),
];
