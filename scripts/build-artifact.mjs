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
const js = result.outputFiles[0].text;
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
await cp('public/assets', path.join(out, 'assets'), { recursive: true });
console.log('wrote', path.join(out, 'diva-fresh-run.html'), (page.length / 1024).toFixed(0) + ' KB');
