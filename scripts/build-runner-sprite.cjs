/**
 * Renders the game's own runner, running away from the camera (seen from behind, as in the game), into a
 * transparent 12-frame sprite strip for the How to Play screen.
 *   (serve public/ on :8080 first)  node scripts/build-runner-sprite.cjs
 */
const { chromium } = require('playwright');
const sharp = require('sharp');
const FW = 240, FH = 360, N = 12;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: FW, height: FH } });
  await p.addInitScript('window.__DIVA_RUNNER_H=1.55');
  await p.goto(process.env.URL || 'http://127.0.0.1:8080/'); await p.waitForFunction('window.__gameReady', null, { timeout: 180000 });
  await p.evaluate(`(async () => { const THREE = await import('/vendor/three/build/three.module.js'); const pl = window.__game.player;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    r.setSize(${FW}, ${FH}); r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.2;
    document.body.innerHTML = ''; document.body.style.background = 'transparent'; document.body.appendChild(r.domElement);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xf4f6f8, 0x8a8a80, 1.7));
    const sun = new THREE.DirectionalLight(0xfff1d9, 2.0); sun.position.set(-3, 12, -10); sc.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.6); fill.position.set(4, 4, 6); sc.add(fill);
    sc.add(pl.group); pl.group.position.set(0, 0, 0); pl.body.rotation.set(0, 0, 0); pl.body.position.set(0, pl.body.position.y, 0);
    if (pl.shadow) pl.shadow.visible = false;
    const cam = new THREE.PerspectiveCamera(30, ${FW} / ${FH}, 0.1, 50); cam.position.set(0, 1.15, 3.3); cam.lookAt(0, 0.8, 0);   // from behind, as the game camera sees him
    window.__frame = (ph) => { pl._pose(ph, 0, 0); pl.body.position.x = 0; r.render(sc, cam); return r.domElement.toDataURL('image/png'); }; })()`);
  const frames = [];
  for (let i = 0; i < N; i++) frames.push(Buffer.from((await p.evaluate(`window.__frame(${(i / N) * Math.PI * 2})`)).split(',')[1], 'base64'));
  await sharp({ create: { width: FW * N, height: FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((f, i) => ({ input: f, left: i * FW, top: 0 }))).webp({ quality: 88, alphaQuality: 95 }).toFile('public/assets/ui/runner-run.webp');
  console.log('wrote public/assets/ui/runner-run.webp', FW * N, 'x', FH); await b.close();
})();
