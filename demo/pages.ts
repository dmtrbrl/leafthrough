// Twelve LeafThrough magazine image pages in reading order.
// Vite resolves these asset URLs for local development and subpath deployments.
export const demoPages: string[] = [
  new URL("./assets/magazine/01-cover.png", import.meta.url).href,
  new URL("./assets/magazine/02-contents.png", import.meta.url).href,
  new URL("./assets/magazine/03-motion.png", import.meta.url).href,
  new URL("./assets/magazine/04-space.png", import.meta.url).href,
  new URL("./assets/magazine/05-shape.png", import.meta.url).href,
  new URL("./assets/magazine/06-surface.png", import.meta.url).href,
  new URL("./assets/magazine/07-geometry.png", import.meta.url).href,
  new URL("./assets/magazine/08-frameworks.png", import.meta.url).href,
  new URL("./assets/magazine/09-light.png", import.meta.url).href,
  new URL("./assets/magazine/10-images.png", import.meta.url).href,
  new URL("./assets/magazine/11-explore.png", import.meta.url).href,
  new URL("./assets/magazine/12-back.png", import.meta.url).href,
];
