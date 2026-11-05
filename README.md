# Diva Fresh · Stain Fighter Run

Mobile browser endless-runner for the Diva Fresh campaign. Players register
with their mobile number (SMS OTP), run down a tree-lined Sri Lankan street
collecting Diva packs and dodging stains, and compete on a live top-10
leaderboard. An admin dashboard shows the live board, manages gift tiers and
exports everything to Excel.

| Part | Stack |
| --- | --- |
| Game | Three.js (ES modules, no bundler needed), vanilla JS/CSS |
| Assets | glTF-Transform + sharp pipeline (`scripts/`) from the raw art in `assets/raw/` |
| Backend | PHP 8.2+, PDO (MySQL in production, SQLite for local dev) |
| SMS | pluggable driver: `log` (dev), generic `http` gateway (Notify.lk / Dialog / Mobitel style), `twilio` |
| Admin | PHP session login, live polling, dependency-free `.xlsx` export |

Live preview of the world (offline build, no registration):
<https://claude.ai/artifact/3y742C6APyV6TYjLFzo4eQ>

## Repository layout

```
public/            web root – deploy this folder
  index.html       game page (register → OTP → lobby → run → game over)
  js/              game modules (world, player, spawner, api client, …)
  css/game.css
  assets/          optimised runtime assets (generated, committed)
  vendor/three/    vendored Three.js modules
  api/*.php        player JSON API
  admin/           admin dashboard (index.php, api.php, admin.js/css)
  router.php       dev router for `php -S`
src/               PHP classes (Db, Phone, Otp, Auth, Scores, Settings, Xlsx, Sms/*)
config/config.php  defaults; override in config/local.php (git-ignored)
database/          schema.mysql.sql, schema.sqlite.sql
scripts/           asset pipeline + screenshot/build tools (Node)
assets/raw/        source art (trees, bushes, clouds, props, road, shelter)
docs/reference/    approved visual references – check every world change against them
docs/screenshots/  phone-size captures of every screen
storage/           sms.log and dev.sqlite (git-ignored)
```

## Run locally

Requirements: PHP 8.2+ with pdo_sqlite (or pdo_mysql), Node 20+ (only for the asset scripts).

```bash
cp config/local.example.php config/local.php
```

Edit `config/local.php` for a quick SQLite dev setup:

```php
return [
  'db'  => ['dsn' => 'sqlite:' . __DIR__ . '/../storage/dev.sqlite', 'user' => null, 'pass' => null],
  'sms' => ['driver' => 'log'],   // OTP codes are written to storage/sms.log
];
```

```bash
php scripts/init-db.php
```

```bash
php -S 0.0.0.0:8080 -t public public/router.php
```

Open <http://localhost:8080> (game) and <http://localhost:8080/admin/>
(admin, default login `admin` / `diva2026`). With the `log` SMS driver, read
the OTP from `storage/sms.log`.

In a GitHub Codespace, forward port 8080 (Ports tab → make it public) and open
the forwarded URL on your phone.

## Deploy to a PHP host (cPanel / VPS)

1. Upload the whole repo; point the web root (document root) at `public/`.
   The `src/`, `config/`, `storage/` folders must stay **outside** the web root.
2. Create a MySQL database and import `database/schema.mysql.sql`
   (or run `php scripts/init-db.php` on the server).
3. Create `config/local.php` from `config/local.example.php`:
   - `db.dsn/user/pass` for MySQL
   - `sms.driver` + gateway credentials (see below)
   - `admin.password_hash` – generate with
     `php -r "echo password_hash('your-password', PASSWORD_DEFAULT);"`
   - `app.allowed_origin` – your game's https origin
4. Make `storage/` writable by PHP.
5. Serve over HTTPS (OTP + admin cookies).

Nginx: route `*.php` to php-fpm and `try_files $uri $uri/ /index.html`.
Apache: PHP files run as-is; `public/api/.htaccess` disables listings.

## SMS gateway

`config/local.php → 'sms'`:

| driver | use |
| --- | --- |
| `log` | development; messages go to `storage/sms.log` |
| `http` | any HTTP gateway. Set `url`, `method`, and `params` – `{to}`, `{message}`, `{sender}` are substituted. Defaults are shaped for Notify.lk; Dialog/Mobitel aggregator APIs work the same way (change `url` and param names). |
| `twilio` | `sid`, `token`, `from` |

Numbers are normalised to `947XXXXXXXX`. OTPs are 4 digits, valid 5 minutes,
5 attempts, 45 s resend cooldown, max 6 per hour per phone.

## Player API (`public/api`)

| Endpoint | Method | Body / headers | Returns |
| --- | --- | --- | --- |
| `register.php` | POST | `{name, phone}` | sends OTP; `{phone, resend_in}` |
| `verify.php` | POST | `{phone, code}` | `{token, player}` |
| `me.php` | GET | `Authorization: Bearer <token>` | `{player}` |
| `score.php` | POST | bearer + `{score, distance, duration}` | `{best, rank, gift, top}` |
| `leaderboard.php` | GET | – | `{top, gifts}` |

Scores are sanity-checked against distance/duration/pickup limits
(`Scores::plausible`) and rate-limited; tokens are stored hashed.

## Admin (`public/admin`)

- **Live top 10** – refreshes every 5 s, full phone numbers, gift per rank.
- **Gift settings** – campaign title/end date/note and rank tiers
  (from–to rank → gift). Shown on the game-over screen and in the export.
- **Players** – search by name or phone.
- **Download Excel** – `.xlsx` with sheets *Leaderboard* (rank, name, phone,
  best, runs, gift), *All runs* and *Gifts*.

## Asset pipeline

```bash
npm install
```

```bash
npm run build:assets      # optimize-assets (trees/bushes/clouds/props/shelter), road textures, vendor three
```

- `scripts/optimize-assets.mjs` – strips ads from the shelter GLB, converts the
  art PNGs in `assets/raw/*` to trimmed WebP sprites + `*.json` aspect files.
- `scripts/make-road-textures.mjs` – asphalt tile from the reference photo and
  the leafy tree-shadow overlay from the tree canopies.
- `scripts/screenshot.mjs http://localhost:8080` – phone + landscape captures
  into `docs/screenshots/`.
- `scripts/build-artifact.mjs <dir> --inline-assets` – single-file offline
  build of the game (what the preview link is made from).

## Still placeholder

- Runner character (capsule) → boy / girl models + run animation
- Pickups (pink pack) and stains (brown blob) → Diva packshots + stain art
- Lobby/HUD typography → final logo and Sinhala tagline artwork
- Sounds
