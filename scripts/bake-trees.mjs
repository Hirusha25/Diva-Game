/**
 * Bakes the two high-poly trees in the raw bus-shelter GLB into billboard
 * sprites (front + side view, transparent background), so the game can draw
 * dozens of trees for the price of two quads each.
 *
 *   node scripts/bake-trees.mjs
 *
 * Output: public/assets/textures/tree-{a,b}-{front,side}.webp + trees.json (sizes)
 * Requires the pre-installed Playwright/Chromium (headless, SwiftShader GL).
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public/assets/textures');
const SIZE = 1024;

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const q = new URLSearchParams(location.search);
const treeName = q.get('tree'), view = q.get('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
renderer.setSize(${SIZE}, ${SIZE}); renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x556633, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 10, 6); scene.add(sun);
new GLTFLoader().load('/assets/raw/chennai-bus-shelter/source/Chennai_Bus_Shelter.glb', g => {
  // Three.js strips dots from node names ("Tree.001" -> "Tree001"), so pick
  // the trees by prefix and ordinal instead of exact name.
  const trees = g.scene.children.filter(o => /^Tree/.test(o.name)).sort((a, b) => a.name.localeCompare(b.name));
  const tree = trees[parseInt(treeName, 10)];
  if (!tree) { window.__err = 'tree not found: ' + g.scene.children.map(o => o.name).join(','); return; }
  const holder = new THREE.Group(); holder.add(tree); scene.add(holder);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  // Square ortho frame around the tallest dimension so both views share a scale.
  const half = Math.max(size.x, size.y, size.z) / 2 * 1.02;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 200);
  const dir = view === 'front' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  cam.position.copy(c).add(dir.multiplyScalar(60)); cam.lookAt(c);
  // Centre vertically on the bounding box, bottom of trunk at the frame bottom.
  cam.top = size.y - half; cam.bottom = -half; cam.position.y = box.min.y + half; cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  window.__info = { size: size.toArray(), frame: half * 2, bottom: box.min.y };
}, undefined, e => { window.__err = String(e); });
</script>`;

const mime = { '.js': 'text/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/bake') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const meta = {};
for (const [key, name] of [['a', '0'], ['b', '1']]) {
  for (const view of ['front', 'side']) {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${port}/bake?tree=${encodeURIComponent(name)}&view=${view}`);
    await page.waitForFunction('window.__info || window.__err', null, { timeout: 300000 });
    const info = await page.evaluate('window.__info || window.__err');
    if (typeof info === 'string') throw new Error(info);
    const png = await page.screenshot({ omitBackground: true });
    const out = path.join(OUT, `tree-${key}-${view}.webp`);
    await sharp(png).webp({ quality: 85, alphaQuality: 90 }).toFile(out);
    meta[key] = { width: info.frame, height: info.frame, trueSize: info.size };
    console.log(`baked ${name} ${view} -> ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    await page.close();
  }
}
fs.writeFileSync(path.join(OUT, 'trees.json'), JSON.stringify(meta, null, 2));
await browser.close(); server.close();
