/**
 * Renders the rigged runner's run cycle (12 frames, side view, transparent)
 * into public/assets/ui/runner-sprite.webp for the loading screen, which shows
 * before the 3D scene has loaded.
 *   npm run serve   (in another terminal)
 *   node scripts/render-loader-runner.cjs     (needs Playwright + Chromium)
 */
const { chromium } = require('playwright');
const sharp = require('sharp');
const FRAMES = 12, W = 240, H = 300;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.addInitScript('window.__DIVA_RUNNER_H = 1.55');
  await p.goto(process.env.URL || 'http://127.0.0.1:8080/');
  await p.waitForFunction('window.__gameReady', null, { timeout: 180000 });
  await p.evaluate(`(async () => {
    const THREE = await import('./vendor/three/build/three.module.js');
    const pl = window.__game.player;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(2); r.setSize(${W}, ${H}); r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.2;
    document.body.innerHTML = ''; document.body.appendChild(r.domElement);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xf4f6f8, 0x9a8a60, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d9, 2.0); sun.position.set(4, 10, 2); sc.add(sun);
    pl.group.visible = true; pl.body.visible = true; sc.add(pl.group); pl.group.position.set(0, 0, 0); pl.body.rotation.set(0, 0, 0);
    const cam = new THREE.PerspectiveCamera(30, ${W} / ${H}, 0.1, 50);
    cam.position.set(3.3, 0.95, -1.3); cam.lookAt(0, 0.78, -0.1);   // he runs to the right, turned slightly toward us
    window.__frame = (i) => { pl._pose(i / ${FRAMES} * Math.PI * 2, 0, 0); r.render(sc, cam); return r.domElement.toDataURL('image/png'); };
  })()`);
  const frames = [];
  for (let i = 0; i < FRAMES; i++) frames.push(Buffer.from((await p.evaluate(`window.__frame(${i})`)).split(',')[1], 'base64'));
  await b.close();
  const fw = W * 2, fh = H * 2, ow = 160, oh = 200;
  const scaled = await Promise.all(frames.map((f) => sharp(f).resize(ow, oh).toBuffer()));
  await sharp({ create: { width: ow * FRAMES, height: oh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(scaled.map((input, i) => ({ input, left: i * ow, top: 0 })))
    .webp({ quality: 88, alphaQuality: 90 }).toFile('public/assets/ui/runner-sprite.webp');
  console.log('wrote public/assets/ui/runner-sprite.webp', FRAMES, 'frames', ow + '×' + oh, `(rendered at ${fw}×${fh})`);
})();
