# Diva Game

**Diva Fresh Run** – a roadside runner scene built from the painted artwork in this repo.

## Run it

It is a static page, no build step. From the repo root:

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. Add `?still` to the URL to freeze the scroll, and `?d=120` to jump 120 m down the road.

## How the scene is put together

- `index.html` / `src/main.js` – the scene. The world is real 3D measured in metres: the road, kerb, pavement and wall are long strips of geometry, and every tree, bush, bus stop and cloud is a sprite stood upright at an `(x, y, z)` position. Perspective comes from the camera, so nothing is positioned by hand in screen pixels. The layout constants at the top of `main.js` (road width, wall height, where the rows of trees and bushes go) are the things to tweak.
- `src/textures.js` – the flat surfaces (asphalt, kerb stripes, paving, wall, leaf shade) are drawn in code.
- `assets/sprites/` – game-ready sprites, generated from the original PNGs by `tools/build_sprites.py` (crops each image tight to its visible pixels so its bottom edge sits on the ground, and shrinks it). Re-run that script after adding or replacing artwork.
- `vendor/` – three.js (MIT).
- `assets/raw/` and the PNGs in the repo root – original artwork, untouched.
