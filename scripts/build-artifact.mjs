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
if (inline) {
  const mime = { glb: 'model/gltf-binary', webp: 'image/webp', json: 'application/json' };
  const files = [
    'assets/models/bus-shelter.glb',
    'assets/textures/asphalt.webp', 'assets/textures/leaf.webp', 'assets/textures/trees.json',
    'assets/textures/tree-a-front.webp', 'assets/textures/tree-a-side.webp',
    'assets/textures/tree-b-front.webp', 'assets/textures/tree-b-side.webp',
  ];
  for (const f of files) {
    const buf = await readFile('public/' + f);
    const uri = `data:${mime[f.split('.').pop()]};base64,${buf.toString('base64')}`;
    js = js.replaceAll(f, uri);
  }
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
<script type="module">
${js}
</script>
`;
await writeFile(path.join(out, 'diva-fresh-run.html'), page);
if (!inline) await cp('public/assets', path.join(out, 'assets'), { recursive: true });
console.log('wrote', path.join(out, 'diva-fresh-run.html'), (page.length / 1024).toFixed(0) + ' KB');
