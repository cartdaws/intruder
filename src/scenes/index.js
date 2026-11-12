// Chapter registry, in story order. Each entry loads its module on demand so the menu appears fast.
export const CHAPTERS = {
  facility: () => import('./facility.js'),
};
export const ORDER = ['facility'];
