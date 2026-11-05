/**
 * Bundles the game into one self-contained HTML fragment (inline CSS + one
 * module script) for hosting on claude.ai Artifacts or any static host.
 *   node scripts/build-artifact.mjs <outDir>
 * Assets (models/textures) stay as separate files next to the page.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';

const out = process.argv[2] || 'dist';
await mkdir(out, { recursive: true });

const result = await build({
  entryPoints: ['public/js/main.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: ['es2022'],
  // 'three' resolves from node_modules (same version as public/vendor/three).
});
let js = result.outputFiles[0].text;
// --inline-assets: embed every model/texture as a data: URI so the page needs
// no supporting files (claude.ai Artifacts refuse .glb and sandbox fetches).
const inline = process.argv.includes('--inline-assets') || process.argv.includes('--inline-models');
let inlineScript = '';
if (inline) {
  // Textures become data: URIs (loaded through <img>, which strict CSPs allow);
  // the model and JSON are handed to the loader in memory via window.__DIVA_INLINE.
  const textures = [
    'assets/textures/asphalt.webp', 'assets/textures/tree-shadows.webp', 'assets/textures/leaf.webp',
    'assets/textures/tree-1.webp', 'assets/textures/tree-2.webp', 'assets/textures/tree-3.webp', 'assets/textures/tree-4.webp',
    'assets/textures/bush-1.webp', 'assets/textures/bush-2.webp', 'assets/textures/bus-stand.webp',
    'assets/textures/cloud-1.webp', 'assets/textures/cloud-2.webp', 'assets/textures/cloud-3.webp', 'assets/textures/cloud-4.webp',
  ];
  for (const f of textures) {
    const buf = await readFile('public/' + f);
    js = js.replaceAll(f, `data:image/webp;base64,${buf.toString('base64')}`);
  }
  const data = {
    models: {},
    json: {
      'assets/textures/trees.json': JSON.parse(await readFile('public/assets/textures/trees.json', 'utf8')),
      'assets/textures/clouds.json': JSON.parse(await readFile('public/assets/textures/clouds.json', 'utf8')),
      'assets/textures/bushes.json': JSON.parse(await readFile('public/assets/textures/bushes.json', 'utf8')),
      'assets/textures/props.json': JSON.parse(await readFile('public/assets/textures/props.json', 'utf8')),
    },
  };
  inlineScript = `<script>window.__DIVA_INLINE = ${JSON.stringify(data)};</script>\n`;
}
const css = await readFile('public/css/game.css', 'utf8');
const html = await readFile('public/index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module" src="js/main.js">'));

const page = `<title>Diva Fresh Run</title>
<style>
html, body { height: 100%; }
${css}
</style>
${body}
${inlineScript}<script type="module">
${js}
</script>
`;
await writeFile(path.join(out, 'diva-fresh-run.html'), page);
if (!inline) await cp('public/assets', path.join(out, 'assets'), { recursive: true });
console.log('wrote', path.join(out, 'diva-fresh-run.html'), (page.length / 1024).toFixed(0) + ' KB');
