# 📊 Chart Analyzer

> Technical analysis untuk **Crypto**, **Forex**, dan **Stocks** — dual mode.
>
> **📸 Screenshot mode** → NVIDIA Nemotron Nano VL 8B membaca CVD/OI/Funding dari screenshot (butuh `server/` lokal, key gratis).
> **📊 CSV mode** → Rule-based engine di browser, 100% frontend, tanpa API key/server apapun.
> **🧠 AI Reasoning** → Nemotron 3 Nano (opsional) kasih penjelasan naratif di atas hasil analisis.
> **⚡ Auto-fetch** → FR + OI langsung dari Binance saat kamu ketik simbol.

---

## Daftar Isi

- [Cara Kerja](#cara-kerja)
- [Cara Running di Lokal](#cara-running-di-lokal)
- [Setup NVIDIA API Key](#setup-nvidia-api-key)
- [Setup Twelve Data API Key (Forex/Stocks auto-fetch, opsional)](#setup-twelve-data-api-key-forexstocks-auto-fetch-opsional)
- [AI Reasoning (Nemotron, opsional)](#ai-reasoning-nemotron-opsional)
- [Cara Pakai](#cara-pakai)
- [Upload ke GitHub](#upload-ke-github)
- [Deploy Gratis ke GitHub Pages](#deploy-gratis-ke-github-pages)
- [Struktur Project](#struktur-project)
- [Kustomisasi Rules](#kustomisasi-rules)
- [Changelog](#changelog)

---

## Cara Kerja

### 📸 Screenshot Mode — NVIDIA Nemotron Nano VL 8B (butuh server lokal)

Upload screenshot chart (Coinglass, TradingView, MT4/5) → Nemotron VL membaca semua yang terlihat:

| Yang dibaca | Sumber |
|---|---|
| Spot CVD | Visual dari panel screenshot |
| Futures CVD | Visual dari panel screenshot |
| Open Interest | Visual dari panel screenshot |
| Funding Rate | Visual dari panel screenshot |
| RSI, Volume note | Visual dari chart |
| Trend visual | Visual dari price action |

**Alur lengkap:**
```
Screenshot upload (browser)
    ↓
Symbol field → Binance API → FR + OI live (gratis, no auth)
    ↓
Browser → server lokal (localhost:3001) → NVIDIA Nemotron Nano VL 8B → ekstrak nilai dari screenshot
    ↓
Engine lokal → terapkan squeeze rules → analisis terstruktur
    ↓
Tampilkan: Nemotron VL Extracted Panel + FR/OI chips + Analisis
```

**Kenapa butuh server?** API NVIDIA (`integrate.api.nvidia.com`) tidak mendukung CORS untuk call
langsung dari browser, jadi request gambar harus lewat proxy kecil di `server/` (lihat
[Setup NVIDIA API Key](#setup-nvidia-api-key)).

**Biaya:** NVIDIA NIM free tier · Binance API = **gratis, tanpa login**.

---

### 📊 CSV Mode — OHLCV Engine (100% offline untuk Crypto/Forex/Stocks manapun)

Upload file CSV data candles → semua kalkulasi berjalan di browser:

| Indikator | Periode | Fungsi |
|---|---|---|
| SMA / EMA | 20, 50, 200 | Trend direction, HTF bias |
| RSI | 14 | Overbought/oversold · extreme gate >75/<25 |
| MACD | 12, 26, 9 | Momentum cross |
| ATR | 14 | Stop sizing, extended-move gate |
| CVD approx | 20 candle | Estimasi buyer/seller delta dari OHLCV |
| Swing High/Low | 50 candle | Support & resistance levels |

**Auto-fetch candle (semua market):** ketik symbol + pilih timeframe → app otomatis tarik 500 candle
terakhir. Sumbernya beda per market:

| Market | Sumber | Butuh key? |
|---|---|---|
| Crypto | Binance public Klines API (+ FR/OI) | Tidak — langsung dari browser |
| Forex | [Twelve Data](#setup-twelve-data-api-key-forexstocks-auto-fetch-opsional) via `server/` | Ya — `TWELVEDATA_API_KEY`, gratis |
| Stocks | [Twelve Data](#setup-twelve-data-api-key-forexstocks-auto-fetch-opsional) via `server/` | Ya — `TWELVEDATA_API_KEY`, gratis |

Kalau symbol nggak ketemu, timeframe nggak didukung, atau key belum di-set, upload/paste CSV manual
tetap tersedia sebagai fallback — begitu upload manual, auto-fetch berhenti nimpa sampai kamu klik
**Ganti**.

> **Catatan:** CVD/OI/Funding dari CSV adalah **estimasi** — nilai exakt hanya bisa dibaca dari screenshot (Screenshot mode).

---

### Auto-fetch FR + OI (Binance public API)

Berlaku di kedua mode, khusus crypto:

1. Ketik simbol di field **SYMBOL** (mis. `BTCUSDT`)
2. App otomatis fetch (debounce 600ms):
   - **Funding Rate:** `fapi.binance.com/fapi/v1/fundingRate?symbol=...&limit=100`
   - **Open Interest:** `fapi.binance.com/fapi/v1/openInterestHist?symbol=...&period=1h&limit=100`
3. Hasilnya tampil sebagai chips: `FR: 0.0100% ↑ ⚠ | OI: 105.7K ↑`
4. Nilai ini masuk ke engine untuk squeeze detection

Kalau simbol tidak ada di pasar futures: `"Futures data unavailable for {symbol}"` — analisis tetap jalan dengan OHLCV saja.

---

### Squeeze detection rules

Engine crypto sekarang mendeteksi kondisi squeeze secara otomatis:

| Kondisi | Output |
|---|---|
| FR extreme+ + OI rising + CVD bearish | `⚠ Long squeeze risk` · BIAS → **Avoid** |
| FR extreme− + OI rising + CVD bullish | `⚠ Short squeeze risk` · BIAS → **Avoid** |
| FR neutral + OI rising + CVD konfirmasi bias | Confidence +1 |
| FR extreme (arah apapun) | Warning dengan nilai exakt di WARNINGS field |

**Threshold extreme:** `|FR| > 0.01%`

---

### Claim validation — vision RSI di-cross-check ke OHLCV asli

Vision LLM (termasuk model bagus sekalipun) terbukti nggak terlalu reliable buat baca angka presisi
dari gambar — [riset audit](https://gist.github.com/roman-rr/c1cd675f7c35b68ae5ac281c30080166) ke
beberapa model frontier nemuin akurasi arah cuma ~51-57% (level lempar koin) buat baca chart. Karena
itu, waktu mode Screenshot **+ CSV** digabung, RSI yang diklaim Nemotron VL nggak langsung dipercaya
mentah-mentah:

| Selisih vision RSI vs OHLCV RSI | Perilaku |
|---|---|
| ≤ 15 poin | Nilai vision dipakai (mungkin lebih current dari candle terakhir CSV), ditandai `(vision)` |
| > 15 poin | Nilai OHLCV yang dipakai, vision value diabaikan + `WARNINGS: Vision RSI (...) meleset jauh dari OHLCV RSI (...)` |

Berlaku di `crypto.js` — cek `rsiMismatch`. Field `trend_visual`/`volume_note` dari vision saat ini
belum di-cross-check (cuma dipakai sebagai gap-filler kalau bias OHLCV Neutral, bukan nimpa sinyal
yang udah confident), jadi risikonya lebih kecil.

---

## Cara Running di Lokal

### Kebutuhan

- [Node.js](https://nodejs.org) v18+
- **CSV mode:** tidak perlu apapun — jalan 100% di browser
- **Screenshot mode + AI Reasoning:** NVIDIA API key (gratis) + `server/` harus jalan, lihat [Setup NVIDIA API Key](#setup-nvidia-api-key)

### Install & jalankan (client — wajib)

```bash
cd D:\BOT\chart-analyzer\client
npm install
npm run dev
```

Buka: **http://localhost:5173/chart-analyzer/**

### Install & jalankan (server — hanya kalau butuh Screenshot mode / AI Reasoning)

```bash
cd D:\BOT\chart-analyzer\server
npm install
cp .env.example .env
# isi NVIDIA_API_KEY di .env — lihat Setup NVIDIA API Key
npm run dev
```

Server jalan di `http://localhost:3001`. Biarin terminal ini tetap terbuka selagi pakai Screenshot mode / AI Reasoning.

### Build untuk production

```bash
cd D:\BOT\chart-analyzer\client
npm run build
# Output: client/dist/
```

> Build production cuma bundle client. `server/` tetap dijalankan terpisah (`npm run dev` / `npm start`) di mesin manapun app di-deploy, kalau Screenshot mode / AI Reasoning mau dipakai.

---

## Setup NVIDIA API Key

Screenshot mode dan tombol AI Reasoning butuh satu NVIDIA API key yang sama. Gratis, tidak perlu kartu kredit.

### Cara dapat key

1. Buka [build.nvidia.com](https://build.nvidia.com)
2. Login/daftar (gratis)
3. Klik **Get API Key** di kanan atas
4. Copy key-nya (`nvapi-...`)

### Cara input ke app

Key disimpan **di server**, bukan browser — beda dari Gemini/OpenRouter versi lama:

1. `cd server`, copy `.env.example` → `.env`
2. Isi `NVIDIA_API_KEY=nvapi-...` di `.env`
3. Jalankan `npm run dev`

`.env` sudah masuk `.gitignore` — key tidak akan ke-commit ke git.

---

## Setup Twelve Data API Key (Forex/Stocks auto-fetch, opsional)

Auto-fetch candle buat **Crypto** pakai Binance (gratis, tanpa key). Buat **Forex** dan **Stocks**,
Binance nggak punya data-nya — dipakai [Twelve Data](https://twelvedata.com) sebagai gantinya (free
tier 800 request/hari, cukup buat pemakaian personal). Tanpa key ini, Forex/Stocks tetap bisa dipakai
lewat **upload/paste CSV manual** — fitur ini murni tambahan kemudahan, bukan syarat wajib.

### Cara dapat key

1. Buka [twelvedata.com/pricing](https://twelvedata.com/pricing) → pilih **Free**
2. Daftar (gratis, email doang)
3. Copy API key dari dashboard

### Cara input ke app

Sama kayak NVIDIA key — masuk `server/.env`:

```
TWELVEDATA_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Restart `server/` (`Ctrl+C` lalu `npm run dev` lagi) biar ke-load.

### Timeframe yang didukung

Twelve Data cuma support subset dari timeframe yang ada di dropdown: `1m 5m 15m 30m 1h 2h 4h 1d 1w 1M`.
Kalau pilih `6h`/`12h`/`3d` di Forex/Stocks mode, auto-fetch bakal gagal dengan pesan jelas — ganti ke
timeframe yang didukung, atau upload CSV manual.

### Format symbol

Ketik biasa aja di app (`EURUSD`, `XAUUSD`, `AAPL`) — sistem otomatis convert format Forex ke yang
dipahami Twelve Data (`EUR/USD`) di sisi server, nggak perlu diketik pake slash manual.

### Model yang dipakai

| Fitur | Model | Kenapa |
|---|---|---|
| Screenshot vision extraction | `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | Cepat (~1s), akurat baca angka dari gambar |
| AI Reasoning (opsional) | `nvidia/nemotron-3-nano-30b-a3b` | Reasoning teks, respons cepat & stabil |

> **Catatan:** `nvidia/llama-3.1-nemotron-nano-8b-v1` (versi lama) sempat dicoba untuk AI Reasoning
> tapi **hang tanpa respons** di backend NVIDIA saat ini — diganti ke `nemotron-3-nano-30b-a3b` yang
> terverifikasi stabil (<1 detik).

---

## AI Reasoning (Nemotron, opsional)

Setelah analisis muncul (mode CSV atau Screenshot), ada tombol opsional:

> 🧠 AI Reasoning (Nemotron Nano 8B, requires local server)

Tombol ini mengirim hasil analisis (BIAS/ENTRY/STOP/TARGET/dst — angka yang sudah dihitung engine lokal)
ke `nvidia/nemotron-3-nano-30b-a3b` untuk dapet penjelasan naratif singkat. **Model ini murni
komentar** — nggak pernah mengubah BIAS/ENTRY/STOP/TARGET/R:R yang sudah dihitung engine.

Butuh `server/` jalan dengan `NVIDIA_API_KEY` terisi — sama persis setup-nya dengan Screenshot mode,
lihat [Setup NVIDIA API Key](#setup-nvidia-api-key). Tanpa server jalan, tombol ini menampilkan error
singkat — **CSV mode tetap jalan normal tanpa server sama sekali**.

---

## Cara Pakai

### CSV Mode (tanpa key apapun)

1. Pilih tab: **Crypto**, **Forex**, atau **Stocks**
2. Pilih mode **📊 CSV Data (Offline)**
3. *(Crypto only)* Ketik simbol → tunggu FR/OI chips muncul
4. Upload file CSV atau paste data OHLCV
5. Klik **Analyze Chart** → hasil instan

### Screenshot Mode (butuh `server/` jalan)

1. Pastikan `server/` udah jalan (`npm run dev` di folder `server`, lihat [Setup NVIDIA API Key](#setup-nvidia-api-key))
2. Pilih tab market
3. Pilih mode **📸 Screenshot + Nemotron VL**
4. Drop screenshot chart
5. Isi: Symbol, Timeframe, Trade Style
6. (Opsional) set HTF Bias
7. Klik **🔍 Extract + Analyze**:
   - Nemotron VL membaca screenshot → tampil panel "Nemotron VL Extracted Data"
   - Engine lokal terapkan rules → tampil analisis lengkap

### Screenshot tanpa CSV (hanya visual)

Jika tidak ada CSV dimuat, analisis tetap dibuat dari nilai yang diekstrak Nemotron VL.
Entry/Stop/Target akan: `"See chart — load CSV for calculated levels"`

### Screenshot + CSV (enriched)

Jika CSV juga dimuat, analisis OHLCV lengkap diperkaya dengan nilai Nemotron VL + Binance FR/OI.

### Format output

```
BIAS: Bullish | Bearish | Neutral | Avoid
PATTERN / PHASE: <struktur price>
ENTRY ZONE: <pullback level — bukan dinding>
STOP: <level + alasan>
TARGET 1: <level>  (R:R x.x:1)
TARGET 2: <level>  (R:R x.x:1)
TARGET 3: <level>  (R:R x.x:1)
R:R: x.x:1 to T1
CONFIDENCE: Low | Medium | High
ORDER FLOW: Spot CVD: ... · OI: ... · FR: ... (crypto)
WARNINGS: <squeeze risk | extreme RSI | extended move | HTF conflict>
NOTES: <reasoning>
```

### Sumber data CSV gratis

| Sumber | Cara download |
|---|---|
| **TradingView** | Chart → `⋯` kanan atas → *Export chart data* |
| **Yahoo Finance** | Halaman saham → *Historical Data* → *Download* |
| **Binance** | Kline API publik (gratis, tanpa login) |
| **CoinGecko** | Halaman coin → *Historical Data* → *Download* |

**Format diterima:**

```csv
time,open,high,low,close,volume
2024-01-01,42000,43100,41800,42500,1234
```

Minimal **30 candle**, disarankan 100+. Kolom `volume` dan `time` opsional.

---

## Upload ke GitHub

### Langkah 1 — Buat repository

1. Buka [github.com/new](https://github.com/new)
2. Nama repo: `chart-analyzer`
3. Visibility: **Public** *(wajib untuk GitHub Pages gratis)*
4. Kosongkan semua → **Create repository**

### Langkah 2 — Sesuaikan nama repo

Buka `client/vite.config.js`:

```js
const REPO_NAME = 'chart-analyzer'; // ← ganti kalau nama repo berbeda
```

### Langkah 3 — Push ke GitHub

```bash
cd D:\BOT\chart-analyzer
git init
git add .
git commit -m "first commit: chart analyzer v4"
git branch -M main
git remote add origin https://github.com/USERNAME/chart-analyzer.git
git push -u origin main
```

> Ganti `USERNAME` dengan username GitHub kamu.

---

## Deploy Gratis ke GitHub Pages

**Hanya CSV mode** yang bisa jalan penuh di GitHub Pages — karena itu satu-satunya bagian yang masih
100% frontend-only. Screenshot mode dan AI Reasoning butuh `server/` (karena API NVIDIA nggak
CORS-enabled). Saat ini client selalu manggil `http://localhost:3001` (hardcoded di
`client/src/engine/nemotronReasoning.js` dan `visionExtract.js`) — jadi dua fitur itu baru jalan kalau
`server/` dijalankan lokal di mesin yang sama dengan browser-nya. Mau deploy `server/` ke hosting
(Render/Railway/Fly.io) dan dipakai dari GitHub Pages? Ganti dulu ke URL yang di-deploy di dua file itu.

### Setup sekali (client saja, CSV mode)

1. Buka repo GitHub → **Settings → Pages**
2. Source: **GitHub Actions** → Save
3. Done — setiap `git push` ke `main` otomatis deploy

Live di: `https://USERNAME.github.io/chart-analyzer/`

### Perbandingan versi

| | v3.0 | v4.0 | v4.2 (sekarang) |
|---|---|---|---|
| CSV mode | GitHub Pages ✅ | GitHub Pages ✅ | GitHub Pages ✅ |
| Screenshot mode | Butuh server (Render, Claude) | GitHub Pages ✅ (OpenRouter, rapuh) | **Butuh server (NVIDIA, stabil)** |
| AI Reasoning | — | — | Butuh server (NVIDIA) |
| API key disimpan | Server (`.env`) | Browser `localStorage` | **Server (`.env`)** |

---

## Struktur Project

```
chart-analyzer/
│
├── .github/
│   └── workflows/
│       └── deploy.yml                   ← Auto-deploy ke GitHub Pages
│
├── .claude/
│   ├── settings.json                    ← Hook: remind update README saat kode berubah
│   ├── commands/
│   │   └── analyze-chart-system.md
│   └── skills/
│       └── trade-decision-engine/
│           └── SKILL.md                 ← Semua rules analisis (sumber kebenaran)
│
├── client/                              ← App utama — frontend (CSV mode 100% mandiri, sisanya perlu server/)
│   ├── src/
│   │   ├── engine/
│   │   │   ├── indicators.js            ← SMA, EMA, RSI, MACD, ATR, cvdApprox, detectTrendStructure
│   │   │   ├── fetchFuturesData.js      ← Binance FR + OI auto-fetch (public API, crypto only)
│   │   │   ├── fetchKlines.js           ← Binance OHLCV candle auto-fetch (public API, crypto only)
│   │   │   ├── fetchOhlcvServer.js      ← Calls local server /api/ohlcv (Twelve Data, forex/stocks)
│   │   │   ├── nemotronReasoning.js     ← Calls local server /api/nemotron-reasoning (NVIDIA Nemotron)
│   │   │   ├── visionExtract.js         ← Calls local server /api/vision-extract (NVIDIA Nemotron VL)
│   │   │   ├── parseCSV.js              ← Parser CSV multi-format (manual upload/paste)
│   │   │   ├── crypto.js                ← Crypto engine: OHLCV + FR/OI/CVD enrichment + vision RSI claim-validation
│   │   │   ├── forex.js                 ← Forex engine: HTF bias, session, weekend guard
│   │   │   └── stocks.js                ← Stocks engine: Wyckoff, volume, MA alignment
│   │   ├── components/
│   │   │   ├── TabBar.jsx
│   │   │   ├── DataInput.jsx            ← CSV upload/paste + symbol field + FR/OI chips
│   │   │   ├── ScreenshotInput.jsx      ← Image upload + Nemotron VL extraction + FR/OI fetch
│   │   │   └── AnalysisResult.jsx       ← Render extracted panel + AI Reasoning button + WARNINGS
│   │   └── App.jsx                      ← Dual-mode router + FR/OI fetch + extraction wiring
│   └── vite.config.js
│
├── server/                              ← Proxy ke NVIDIA + Twelve Data (semua yang kena CORS)
│   ├── .env                             ← NVIDIA_API_KEY, TWELVEDATA_API_KEY (gitignored, bikin dari .env.example)
│   └── src/
│       ├── index.js                     ← Express routes: /api/vision-extract, /api/nemotron-reasoning, /api/ohlcv
│       ├── visionExtract.js             ← nvidia/llama-3.1-nemotron-nano-vl-8b-v1
│       ├── nemotronReasoning.js         ← nvidia/nemotron-3-nano-30b-a3b
│       ├── fetchOhlcv.js                ← Twelve Data time_series (forex/stocks candle)
│       └── visionAnalyze.js             ← Legacy Claude Vision path (tidak dipakai)
│
├── .gitignore
├── WHATS_NEW.md                         ← Dokumentasi perubahan per versi
└── README.md
```

---

## Kustomisasi Rules

Semua aturan keputusan ada di satu file:

```
.claude/skills/trade-decision-engine/SKILL.md
```

Setelah edit, minta Claude Code:
```
Update crypto.js, forex.js, stocks.js sesuai perubahan di SKILL.md
```

| Setting | Default | File |
|---|---|---|
| R:R gate Crypto | ≥ 2:1 | `crypto.js` — `const RR_GATE` |
| R:R gate Forex | ≥ 1.5:1 | `forex.js` — `const RR_GATE` |
| R:R gate Stocks | ≥ 2:1 | `stocks.js` — `const RR_GATE` |
| Extreme RSI gate | >75 / <25 | `crypto.js`, `stocks.js` |
| Extended move gate | >2×ATR / 5 candle | semua engine |
| FR extreme threshold | `\|FR\| > 0.01%` | `fetchFuturesData.js` + `crypto.js` |
| CVD lookback | 20 candle | `indicators.js` — `cvdTrend()` |
| Vision extraction model | `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | `server/src/visionExtract.js` — `MODEL` |
| AI Reasoning model | `nvidia/nemotron-3-nano-30b-a3b` | `server/src/nemotronReasoning.js` — `MODEL` |
| NVIDIA key storage | `server/.env` — `NVIDIA_API_KEY` | server-side only, tidak di browser |
| Vision RSI mismatch threshold | > 15 poin → diabaikan | `crypto.js` — `rsiMismatch` |
| Binance klines auto-fetch limit | 500 candle terakhir | `fetchKlines.js` — parameter `limit` |
| Twelve Data auto-fetch limit | 500 candle terakhir | `server/src/fetchOhlcv.js` — `outputsize` |
| Twelve Data key storage | `server/.env` — `TWELVEDATA_API_KEY` | server-side only, opsional (Forex/Stocks) |

---

## Changelog

| Versi | Keterangan |
|---|---|
| **v4.4** | **Auto-fetch OHLCV Forex/Stocks** — via Twelve Data (`server/src/fetchOhlcv.js`, `/api/ohlcv`), opsional key gratis. Auto-fetch sekarang jalan di Screenshot mode juga (dulu CSV mode doang) dan nggak lagi ke-reset pas ganti tab CSV↔Screenshot. **Fix JSON parsing** — Nemotron VL kadang nulis angka pakai koma ribuan (`63,786.6`) yang bikin JSON parse gagal; prompt + parser dibikin lebih toleran. **Layout landscape** — input kiri, hasil analisis kanan begitu ada hasil (sebelumnya 1 kolom stacked). |
| v4.3 | **Auto-fetch OHLCV dari Binance** — ketik symbol crypto + timeframe di CSV mode, candle otomatis ke-fetch, nggak perlu upload manual (`fetchKlines.js`). **Claim validation** — RSI hasil vision extraction di-cross-check ke RSI OHLCV asli; kalau beda >15 poin, nilai OHLCV yang dipakai + WARNING (respons ke riset yang nunjukin vision LLM ~coin-flip akurasinya buat baca chart). Label UI "(Gemini)" yang ketinggalan diganti "(vision)". |
| v4.2 | Screenshot vision extraction dipindah dari OpenRouter free tier (model gratis rutin didepresiasi, error "unavailable for free") ke `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` lewat `server/`. AI Reasoning diganti dari `llama-3.1-nemotron-nano-8b-v1` (hang di backend NVIDIA) ke `nemotron-3-nano-30b-a3b` (stabil, terverifikasi <1 detik). Settings panel ⚙ + OpenRouter key dihapus — key sekarang di `server/.env`, bukan browser. **Trade-off:** Screenshot mode & AI Reasoning sekarang butuh `server/` jalan (tidak lagi murni GitHub Pages); CSV mode tetap 100% frontend-only. |
| v4.1 | Tombol opsional 🧠 AI Reasoning via NVIDIA Nemotron (diperbaiki di v4.2, lihat di atas). |
| v4.0 | Vision extraction (awalnya Gemini, lalu OpenRouter free vision models — no server). Binance auto-fetch FR+OI. CVD approximation dari OHLCV. Squeeze detection rules (long/short). Settings panel ⚙. |
| v3.0 | Dual-mode: Screenshot (Claude Vision, butuh server) + CSV. Fix RSI NaN, MACD guard. Swing trend detection. Extreme gate. TP3. Pullback entry zones. |
| v2.0 | Rule-based OHLCV engine di browser, tanpa API key. |
| v1.0 | Versi awal: Claude Vision API, butuh server. |

---

> ⚠️ Not financial advice. Technical analysis tooling only.
