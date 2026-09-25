# aoox-cli

CLI (`aoox`) untuk aoox — dipasang di laptop developer, bukan di server. Tugas utamanya:
build image secara lokal, push ke registry aoox, lalu memicu deploy lewat API panel
(`../aoox-api`). Panel web ada di `../aoox-web`.

## Perintah

- `npm run build` — `tsc -b` ke `dist/`
- `npm test` — mocha (`posttest` otomatis menjalankan `npm run lint`)
- `npm run lint` — eslint (`eslint-config-oclif`)
- `./bin/dev.js <perintah>` — jalankan dari TypeScript tanpa build (ts-node/esm)
- `./bin/run.js <perintah>` — jalankan hasil build di `dist/`

## Git

- Jangan commit atau push kecuali diperintahkan secara eksplisit oleh user.

## Struktur

- `src/commands/<nama>.ts` — satu file = satu perintah (`export default class extends Command`).
  Nama file menentukan nama perintah; subfolder jadi topic. Jangan daftarkan manual di mana pun:
  `oclif.commands` di `package.json` menunjuk `./dist/commands`.
- `src/lib/` — semua yang bukan perintah (config, klien API, tipe, flag bersama).
- `test/**/*.test.ts` — mocha + chai. Helper murni diuji langsung; perintah yang menyentuh
  jaringan **tidak** diuji (belum ada mock HTTP) — `@oclif/test` `runCommand` disediakan template
  untuk perintah yang tidak butuh jaringan.

## ESM

`"type": "module"` dengan `module`/`moduleResolution` = `Node16`. Konsekuensi: **semua import
relatif wajib berekstensi `.js`** walau filenya `.ts` (`import {api} from '../lib/api.js'`).
Salah di sini baru ketahuan saat runtime, bukan saat `tsc`.

## Nama executable

Satu nama kanonik: `aoox`.

- `bin` (npm): satu entri, `{"aoox": "./bin/run.js"}`. Ini yang dibuat npm saat `npm i -g`;
  nama yang tidak terdaftar di sini tidak akan ada.
- `oclif.bin`: `aoox` — dipakai untuk teks help (`$ aoox …`), prefix env var, dan nama folder
  default.
- `oclif.dirname`: `aoox` → `this.config.configDir` = `%LOCALAPPDATA%\aoox` (Windows) atau
  `~/.config/aoox`. Kalau tidak diisi, ia ikut `oclif.bin`.

## Konfigurasi & kredensial

- `aoox login` menyimpan `{url, token}` di `<configDir>/config.json` dengan mode `0600`
  (`chmod` menyusul `writeFile` karena `mode` hanya berlaku saat file dibuat; gagal di Windows diabaikan).
- Token = **API token platform** (`aoox_…`, dibuat di panel Settings → Akun), bukan JWT sesi.
  Ia bertindak sebagai user pemiliknya dan dibaca ulang dari DB tiap request di sisi API.
- Flag `--url`/`--token` ada di `src/lib/flags.ts` dan membawa `env:` oclif
  (`AOOX_URL`, `AOOX_TOKEN`), jadi CI tidak perlu `aoox login` dan fallback-nya
  tetap muncul di `--help`.
- `resolveCredentials()` (pure, di-unit-test): flag/env menang per field, **kecuali** token
  tersimpan tidak pernah dikirim ke panel lain — `--url` ke host berbeda tanpa `--token` ditolak,
  supaya kredensial tidak bocor ke host yang salah.
- Token tidak diminta lewat argumen secara default: `aoox login` mem-prompt dengan mask
  (`@inquirer/prompts`), karena token di command line masuk history shell dan daftar proses.
  Tanpa TTY (CI) perintahnya menolak dan menyuruh memakai flag/env.

## Klien API (`src/lib/api.ts`)

- `fetch` global (Node ≥ 22; `engines` dinaikkan ke 22 karena aturan lint `n/no-unsupported-features`
  benar: `fetch`/`Response` baru stabil di Node 21).
- Header `connection: close`: satu run CLI cuma 1–2 request, jadi keep-alive tidak berguna —
  server boleh menutup socket-nya lebih awal. Ini **bukan** penambal crash Windows di bawah
  (awalnya dikira begitu — ternyata cuma menutupi kasus 1 request; lihat `windows-exit-fix.ts`
  untuk penambal yang sebenarnya).
- Error body NestJS `{statusCode, error, message}` di-ekstrak `messageFromBody()` (pure, di-unit-test);
  `message` bisa array saat `ValidationPipe` menolak DTO.
- `ApiError.status === 0` berarti panel tidak terjangkau (DNS/refused/TLS/timeout), bukan balasan HTTP.

## Crash Windows: `process.exit()` setelah ≥2 `fetch()` (`src/lib/windows-exit-fix.ts`)

- **Gejala**: di Windows, tiap kali sebuah command oclif **gagal** (menyentuh `this.error()`/`this.exit()`
  setelah **dua atau lebih** panggilan `fetch()` selesai) — Node crash: `Assertion failed:
  !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`, dan exit code asli (mis. 2)
  tergantikan **127**. Terbukti lewat isolasi (`probe*.mjs` di scratchpad, tanpa oclif sama sekali):
  bukan soal socket keep-alive (header `connection: close` maupun `getGlobalDispatcher().close()`
  eksplisit **tidak** membantu di atas 1 request), dan bukan soal event-loop tick (`setImmediate`
  tidak cukup) — hanya **exit alami** (loop kosong tanpa `process.exit()` eksplisit) yang selalu bersih;
  delay tetap (`setTimeout`) baru "menolong" di atas ±100 ms, yang tidak layak dipercaya atau dibayar
  di tiap error. Ini bug race libuv/undici Windows di teardown socket, di luar kendali userland —
  **bukan** bug di kode CLI ini.
- **Kenapa ini penting untuk CLI ini**: `@oclif/core`'s `errors/handle.js` memanggil `process.exit()`
  di **setiap** command yang error (termasuk semua `this.error()`/`this.exit()` di sini) — jadi tiap
  command yang gagal setelah ≥2 request (mis. `aoox link` dengan `--app` salah: `GET /projects` lalu
  `GET /applications?projectId=`) kena.
- **Penambal** (`applyWindowsExitFix()`, dipasang paling awal di `bin/run.js` **dan** `bin/dev.js`,
  sebelum `execute()`/`fetch()` apa pun): di Windows saja, mengganti `process.exit` dengan versi yang
  cuma menyetel `process.exitCode` lalu **kembali** (tidak benar-benar keluar) — Node lalu keluar
  sendiri begitu event loop kosong, yang dalam praktiknya seketika. Diuji lewat objek `proc` palsu
  (`ExitLike`, `test/lib/windows-exit-fix.test.ts`) supaya tidak perlu memutasi `process` sungguhan
  di proses test mocha sendiri.
- **Trade-off yang diterima**: cabang SIGINT di `handle.js` memanggil `process.exit(1)` lalu **terus
  jalan** (mencetak error) sampai `process.exit()` terakhirnya sendiri di akhir fungsi — dengan
  penambal ini, lanjutan itu jadi teramati (bukan langsung berhenti). Tidak masalah untuk command
  yang ada sekarang (tidak ada yang bergantung Ctrl+C sinkron); tinjau ulang kalau `aoox logs`/`aoox
  deploy` streaming nanti butuh itu.

## Catatan oclif v4

- `@oclif/core` v4 **tidak punya `ux.prompt`** (hanya `action`, `colorize`, `error`, `exit`,
  `stderr`, `stdout`, `warn`) — prompt memakai `@inquirer/prompts`.
- `static enableJsonFlag = true` → nilai yang di-`return` dari `run()` dicetak sebagai JSON saat
  `--json`, dan `this.log` otomatis dibungkam, jadi output JSON tetap sah.
- `this.error(msg, {suggestions})` keluar dengan code 2 dan mencetak "Try this".

## Tipe dari API

Tidak ada paket bersama. Tipe respons disalin tangan ke `src/lib/types.ts` — pola yang sama
dengan web (`src/features/**/*.entity.ts`). Tiap tambahan harus dicocokkan dengan DTO di
`aoox-api`.

## Status & rencana

Sudah ada: `aoox login`, `aoox whoami`, `aoox link`, `aoox deploy`, `aoox install`.
Berikutnya: `aoox logs` (Socket.IO `/logs` + tiket 60 detik, protokolnya dicermin dari API) — `aoox
deploy` sekarang sudah mem-follow log deployment sendiri lewat polling, jadi `aoox logs` di atas
Socket.IO baru dibutuhkan untuk log container live di luar konteks satu deploy.

## `aoox install` (`src/commands/install.ts`, `src/lib/{install-env,system}.ts`, `assets/install/`)

Bootstrap aoox di VPS **baru** lewat Docker Compose — dijalankan **di VPS itu sendiri**
(`sudo aoox install`), bukan dari laptop lewat SSH (opsi itu diajukan lalu ditolak user — lebih
sederhana & standar seperti installer PaaS self-hosted lain, tanpa CLI perlu logika SSH client sendiri).
- **File compose dan `.env.dist.example` di-bundle di dalam paket CLI** (`assets/install/`), **bukan**
  di-`curl` dari `aoox-api` saat instalasi — dicoba dulu (`curl .../-/raw/main/...`), repo-nya
  **private** dan anonymous fetch 302 ke halaman login GitLab. Jadi zero dependensi jaringan ke
  private repo saat instalasi (lebih sedikit yang bisa gagal, jalan walau GitLab down); **konsekuensinya
  file itu harus disinkronkan tangan** kalau `docker-compose.dist.yml`/`docker-compose.domain.yml` di
  `aoox-api` berubah — dicatat di `assets/install/README.md`. Resolusi path pakai
  `import.meta.url` (`../../assets/install/` dari file command) — sama kedalaman relatif dari
  `dist/commands/install.js` (prod) maupun `src/commands/install.ts` (`bin/dev.js`), diverifikasi
  keduanya resolve ke folder yang sama.
- `buildEnvFile()` (`install-env.ts`, pure, di-unit-test) menulis `.env.dist` **baru dari nol**
  (bukan template-fill file contoh yang penuh komentar — rapuh disinkronkan dengan prosa), dengan key
  yang sama yang dibaca compose. **Ada tes regresi drift** (`install-env-coverage.test.ts`): membaca
  `${VAR}` apa saja yang direferensikan kedua file compose ter-bundle dan menuntut `buildEnvFile`
  menulis semuanya (kecuali `API_IMAGE`/`WEB_IMAGE`/`JWT_EXPIRES_IN`, yang sengaja punya default di
  level compose dan tidak ditulis) — tes ini yang menemukan `COOKIE_SECURE` awalnya lupa ditulis.
  Secret (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`) dari `crypto.randomBytes`.
  `PUBLIC_IP`/`WEB_ORIGIN`/`PUBLIC_API_URL` dari IP publik yang dideteksi (`detectPublicIp()`,
  `https://api.ipify.org` — jasa yang sama yang dipercaya `check-domain-dns` di API) kecuali mode
  domain (`--web-domain`+`--api-domain`, **wajib** `--acme-email` — tanpa itu resolver `le` yang
  dirujuk label `docker-compose.domain.yml` tidak pernah ada, https gagal diam-diam).
- `system.ts` (sebagian besar impure — exec/spawn, tidak di-unit-test kecuali `isIpv4` yang pure):
  `isRoot()` (`process.getuid()`, wajib — tulis ke `/opt` + kelola Docker), `commandExists`/
  `dockerRunning` (`docker info`), `dockerSocketGid()` (`stat -c %g /var/run/docker.sock` — dipakai
  `DOCKER_GID` di compose, gotcha yang didokumentasikan manual sekarang otomatis), `runShellInherit`
  (dipakai untuk `curl -fsSL https://get.docker.com | sh` — **hanya setelah konfirmasi**, kecuali
  `--yes`; instalasi Docker itu sendiri sistem-lebar, bukan tindakan diam-diam).
- Alur `run()`: platform harus Linux + root → (Docker belum ada/jalan? tawarkan pasang) → konfirmasi
  rencana (`--force` untuk menimpa `--dir` yang sudah ada, `--yes` melewati semua prompt) → salin
  compose ter-bundle ke `--dir` → `chown 1000:1000 <dir>/secrets` (gotcha EACCES terminal SSH key yang
  didokumentasikan di compose comment — sekarang otomatis) → `.env.dist` → `docker compose … up -d`
  (lewat `dockerInherit` yang sama dengan `aoox deploy`) → poll `GET localhost:3001/auth/setup-status`
  sampai API benar-benar siap (migrasi jalan saat boot, "container up" ≠ "siap") → cetak URL + info
  `/setup` (kecuali `--admin-email` diisi, non-interaktif).
- **Diverifikasi**: resolusi path asset (dist & dev mode, keduanya nyata ada di disk), tes drift
  cakupan env vs compose ter-bundle, precondition gate (bukan Linux → error jelas, `--api-domain`
  tanpa `--web-domain` → ditolak `dependsOn` oclif sendiri sebelum kode ini jalan sama sekali; keduanya
  exit 2 bersih, bukan crash Windows karena terjadi sebelum `fetch` apa pun). **Belum diuji hidup**
  di VPS Linux sungguhan (tidak tersedia di sesi ini) — `docker compose up -d`, instalasi Docker
  otomatis, dan polling `/setup-status` mengandalkan `dockerInherit`/`fetch` yang sudah terbukti di
  `aoox deploy`, tapi jalur orkestrasi penuh `install.ts` sendiri belum dicoba end-to-end nyata.

## `aoox deploy` (`src/commands/deploy.ts`, `src/lib/{docker,git,image-ref}.ts`)

Build & push berjalan **di laptop**, bukan di server (alasan CLI ini ada) — API-nya hanya menerima
hasilnya lewat jalur `sourceType: 'image'` yang sudah ada:
1. `readLink(cwd)` → wajib sudah `aoox link`. `loadCredentials(..., link.url)` — token dari
   `aoox login` dipakai hanya kalau host-nya sama dengan link (aturan `resolveCredentials`).
2. `GET /applications/:id` (bukan dari cache link file) untuk `appName`, `project.name`, dan
   sourceType/imageRegistryId terkini — **beda dari list**: hanya `get-application` yang menyertakan
   `project` bersarang; `list-applications` tidak (diverifikasi lewat curl).
3. Pilih registry: `--registry <id>` eksplisit, kalau tidak **default ke registry `self-hosted`**
   (`RegistryDto.type`) — pilihan default ini yang saya ambil sendiri karena registry lokal memang
   dibuat untuk ini; registry eksternal/beberapa registry tanpa yang self-hosted → prompt `select`
   (atau error minta `--registry` tanpa TTY). `GET /registries/:id/credentials` (flow API yang baru,
   lihat AGENTS.md aoox-api) untuk `docker login`.
4. Tag = `--tag`, atau `deployTag(cwd)` (`git.ts`): `git rev-parse --short HEAD` + `-dirty` kalau
   `git status --porcelain` tidak kosong (termasuk file untracked seperti `.aoox.json` yang
   baru ditulis `aoox link` — **diuji nyata**, itu justru yang membuktikan deteksi dirty jalan), atau
   timestamp ISO kalau bukan repo git. `sanitizeTag()` (pure, di-unit-test) memastikan hasilnya
   valid untuk **keduanya**: aturan tag Docker (tanpa `:`) **dan** regex `imageRef` DTO API yang
   menolak huruf besar di mana pun (bukan cuma di tag) — timestamp ISO (`T`/`Z`) harus di-lowercase.
5. `imageRefFor()` (`image-ref.ts`, pure, di-unit-test) **mencermin persis** `slugPart()` di
   `deployment-runner.service.ts` API (`<registry.url>/<slug(project.name)>/<appName>:<tag>`) —
   supaya image yang dibangun di laptop mendarat di path yang sama seperti kalau API sendiri yang
   build.
6. `docker build`/`docker push` via `dockerInherit()` (`docker.ts`, `spawn` dengan `stdio:'inherit'`
   — output docker sendiri sudah enak dibaca, tidak perlu dibungkus). `docker login` via
   `dockerLogin()` — password lewat **stdin** (`--password-stdin`), bukan argv (tidak masuk daftar
   proses/history). Registry tanpa username/password (registry publik) → langkah login dilewati.
7. `PATCH /applications/:id {sourceType:'image', imageRef, imageRegistryId}` lalu
   `POST /:id/deploy` — inilah yang membuat API **menarik balik** image yang baru saja di-push CLI
   (`pullSourceImage()`, otentikasi otomatis dari `imageRegistryId` yang sama) lalu me-replace
   container-nya; jalur teruji yang sudah ada, tidak ada kode baru di API untuk build khusus CLI.
8. `follow()` mem-poll `GET /deployments/:id` tiap 1,5 detik, mencetak potongan `logs` yang baru
   (bukan dari Socket.IO — cukup untuk satu deploy, tanpa dependensi baru), berhenti di
   `success`/`failed` (exit 1 + `errorMessage` kalau gagal). Rekursi, bukan `for(;;)`, supaya lint
   `no-await-in-loop` (yang menyasar await tak sengaja berurutan) tidak menyala untuk polling yang
   memang disengaja berurutan.
- **Diuji nyata, penuh**: app throwaway `sourceType:image` di project "Smoke Test" (dibuat lewat
  curl karena `aoox link` v1 tidak bisa membuat aplikasi baru), repo git kecil dengan Dockerfile
  nginx, `aoox link` → `aoox deploy` tanpa flag apa pun → build (base image ditarik, layer di-cache
  BuildKit) → `docker login localhost:5000` sukses → push (satu layer "Mounted from" — dedup
  registry jalan) → API menarik ulang lewat kredensial yang sama → container `Up`, `GET
  /applications/:id` melaporkan `status:"running"` dan `currentImage` = image yang sama persis yang
  di-push CLI. `--registry <id salah>` gagal cepat (sebelum docker build apa pun disentuh, exit 2,
  bukan crash). Semua artefak uji dibersihkan (app dihapus, tag registry dihapus + GC, image lokal
  dihapus).

## `aoox link` (`src/lib/link.ts`, `src/commands/link.ts`)

- Menulis `.aoox.json` di **root repo saat ini** (bukan config dir oclif — ini per repo, bukan
  per mesin): `{url, projectId, projectName, applicationId, applicationName}`. Aman di-commit —
  isinya cuma id/nama, tanpa token — supaya semua kontributor repo otomatis terhubung ke aplikasi
  yang sama tanpa harus link manual masing-masing.
  `readLink()`/`writeLink()`/`linkPath()` sejajar `config.ts` (Node fs polos, tanpa dependensi baru).
  `url` ikut disimpan (bukan hanya id) supaya nanti `aoox deploy`/`aoox logs` bisa lewat
  `resolveCredentials()` yang sama seperti flag `--url` — token yang tersimpan tidak terkirim ke
  panel lain dari yang link ini dibuat untuknya.
- **v1 hanya memilih dari aplikasi yang sudah ada** (`GET /applications?projectId=`) — tidak bisa
  membuat aplikasi baru dari CLI (itu perlu banyak field: sumber git/image, port, dll., di luar
  cakupan "link"). Project/aplikasi kosong → pesan error menyuruh buat dulu di panel.
- `--project <id>`/`--app <id>` melewati pemilihan interaktif (`@inquirer/prompts` `select()`) —
  dipakai CI/scripting; tanpa TTY dan tanpa flag → error yang jelas, bukan macet menunggu input.

## CI

`.github/workflows/npm-publish.yml`: tiap `git push --follow-tags` bikin tag `v*` yang memicu
build + `npm test` + `npm publish`, dist-tag npm diturunkan dari label pre-release versi
(`0.1.0-alpha.1` → `alpha`, `1.0.0` tanpa label → `latest`) — lihat `RELEASING.md`. Autentikasi
lewat **npm Trusted Publishing (OIDC)** — `permissions.id-token: write` di workflow, tanpa token
tersimpan sama sekali (npm token granular dengan akses publish langsung sedang di-deprecate per
Jan 2027). Trusted publisher baru bisa didaftarkan di npmjs.com **setelah** package `aoox` ada,
jadi publish pertama tetap manual dari mesin dev (2FA normal) — urutan lengkap ada di
`RELEASING.md`. `npm publish` memicu hook `prepack` = `oclif manifest && oclif readme`, jadi **README
diregenerasi otomatis** dari daftar perintah — jangan menyunting bagian di antara penanda
`<!-- commands -->` manual. Belum ada CI untuk PR/push biasa (cuma jalan saat tag rilis) —
`npm run lint`/`npm run build`/`npm test` masih perlu dijalankan manual sebelum merge.
`scripts.lint` memakai `--max-warnings=0` supaya warning ikut menggagalkan pipeline, bukan cuma
error.

## Instalasi CLI sendiri (sementara: manual dari sumber)

Belum ada `npm i -g aoox` (belum publish ke registry mana pun — keputusan disengaja, lihat di
atas). README (bagian antara `<!-- usagestop -->` dan `# Commands`, **tidak** tersentuh `oclif
readme`) mendokumentasikan cara manual: `git clone` (repo private, perlu kredensial GitLab) →
`npm install && npm run build && npm link`. Konsekuensi untuk `aoox install`: VPS tujuan perlu Node
≥22 **dan** clone+build+link ini dulu, baru `sudo aoox install` — belum ada skrip bootstrap satu
baris (`curl | sh`) yang merangkai instal Node + ambil CLI + `aoox install`; ditunda sampai kanal
distribusi diputuskan (otomatisasi git-clone pakai token juga diajukan & ditunda user, bukan
prioritas sekarang). Kalau nanti README diregenerasi (`npx oclif readme`, atau otomatis lewat
`prepack` saat `npm pack`/tag), bagian manual-install ini **selamat** karena berada di luar ketiga
pasangan penanda (`toc`/`usage`/`commands`) — sudah diverifikasi lewat regenerasi nyata.
