import { defineConfig } from 'vite';
// Relative base so the same build runs from /intruder/next/ and later from the site root.
// __BUILD__ is the label shown on the start menu, so it is obvious which version a phone is running.
const d = new Date();
const stamp = process.env.BUILD_LABEL || `R${d.toISOString().slice(2, 10).replace(/-/g, '')}.${d.toISOString().slice(11, 16).replace(':', '')}`;
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1500 }, define: { __BUILD__: JSON.stringify(stamp) } });
