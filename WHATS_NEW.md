# 🆕 What's New — Chart Analyzer v3.0

Dokumen ini menjelaskan semua perubahan dan fitur baru dibandingkan versi sebelumnya (v2.0).

---

## v3.1 — Screenshot Mode Pindah dari Claude Vision ke NVIDIA (Gratis)

`/api/vision` (`server/src/visionAnalyze.js`) sekarang manggil **NVIDIA `minimaxai/minimax-m3`** (build.nvidia.com NIM) lewat `NVIDIA_API_KEY`, bukan lagi Anthropic Claude Opus lewat `ANTHROPIC_API_KEY` — Anthropic key berbayar, NVIDIA build API gratis. Dependency `@anthropic-ai/sdk` sudah dihapus dari `package.json`. Parsing JSON dibikin lebih toleran (`parseJsonLoose`, direuse dari `visionExtract.js`) karena MiniMax M3 nggak punya forced-JSON tool-use seketat Claude.

Trade-off: MiniMax M3 model MoE besar (428B) → latensi per-request bisa lebih tinggi dari Claude, dan API key gratis NVIDIA biasanya kena rate-limit kalau dipakai sering. Sudah dites live — model dengan benar menolak menganalisis gambar yang bukan chart trading, jadi tidak mengarang data.

---

## Ringkasan Cepat

| | v2.0 | v3.0 |
|---|---|---|
| Input | CSV saja | CSV + Screenshot |
| Analisis crypto | MA/RSI/MACD (OHLCV) | + Claude Vision baca CVD/OI/Funding |
| Take-profit | T1, T2 | **T1, T2, T3** |
| Entry zone | Pinned ke harga saat ini | **Pullback zone (struktural)** |
| Trend detection | Endpoint kasar | **Swing High/Low sequence** |
| Gate ekstrem RSI | Tidak ada | **No-trade jika RSI >75 atau <25** |
| WARNINGS field | Tidak ada | **Ada — amber box** |
| ORDER FLOW field | Tidak ada | **Ada — crypto screenshot** |
| HTF Bias input | Tidak ada | **Ada — downgrade confidence jika konflik** |
| RSI flat series | NaN (bug) | **50 (fixed)** |
| MACD insufficient data | Crash | **Empty array, handled gracefully (fixed)** |

---

## 1. Dual-Mode Input

### Sebelumnya (v2.0)
Hanya bisa input CSV data OHLCV. Tidak ada cara untuk membaca screenshot chart.

### Sekarang (v3.0)

**Dua mode yang sepenuhnya terpisah:**

```
Mode 1: 📸 Screenshot (Vision)
─────────────────────────────
Screenshot chart → server → Claude Vision API
Claude membaca SEMUA yang terlihat:
  - Spot CVD
  - Futures CVD
  - Open Interest
  - Funding Rate
  - RSI, Volume, Price structure
Butuh: server running + NVIDIA API key (build.nvidia.com, gratis)

Mode 2: 📊 CSV Data (Offline)
──────────────────────────────
File CSV OHLCV → browser engine
Hitung: MA20/50/200, RSI, MACD, ATR, Swing H/L
Tanpa API key, tanpa server, 100% gratis
```

> **Kenapa dipisah?** Screenshot tidak bisa dimasukkan ke engine CSV — tidak ada array OHLCV dari gambar. Dan engine CSV tidak bisa membaca CVD/OI/Funding karena data itu tidak ada di kolom OHLCV. Dua path berbeda, dua engine berbeda.

---

## 2. Screenshot Mode — Claude Vision

### Apa yang bisa dibaca

Khusus untuk crypto, Claude sekarang bisa membaca panel order-flow yang tampil di screenshot (Coinglass, TradingView dengan indikator tambahan, dll):

| Metric | Sebelumnya | Sekarang |
|---|---|---|
| Spot CVD | ❌ Tidak bisa | ✅ Dibaca dari screenshot |
| Futures CVD | ❌ | ✅ |
| Open Interest | ❌ | ✅ |
| Funding Rate | ❌ | ✅ |
| Price structure | ❌ | ✅ |

### Interpretasi order-flow yang digunakan

Claude diajarkan pola ini:

```
Harga naik + Spot CVD naik + OI naik
→ Rally sehat, buyer genuine, high-conviction long

Harga naik + OI turun + Futures CVD negatif
→ Short-covering, fragile, jangan long di resistance

Harga turun + Futures CVD turun + OI turun
→ Downtrend kuat, short saat rally

Funding positif di tengah downtrend
→ Long terperangkap, ada bahan bakar downside

Funding ekstrem (>0.05% atau <-0.05%)
→ Risiko flush posisi ramai
```

### Field output baru: ORDER FLOW

Hanya muncul di analisis crypto screenshot:

```
ORDER FLOW: Spot CVD: Positive (naik) · Futures CVD: Negative · OI: Rising · Funding: +0.02%
```

Ditampilkan dalam kotak teal di UI.

---

## 3. Metadata Screenshot

Saat upload screenshot, user sekarang bisa mengisi:

| Field | Pilihan | Fungsi |
|---|---|---|
| **Symbol** | Text bebas (BTCUSDT, EURUSD, dll) | Konteks untuk Claude |
| **Timeframe** | 1m – 1M | Claude menyesuaikan analisis |
| **Trade Style** | Scalp / Swing / Position | Mempengaruhi horizon target |
| **HTF Bias** | Bullish / Bearish / Neutral | Lihat fitur #8 |

---

## 4. Tiga Prompt File Terpisah Per Asset Class

### Sebelumnya
Satu file `server/src/prompts.js` dengan tiga string konstanta.

### Sekarang
Tiga file markdown terpisah, masing-masing berdiri sendiri:

```
server/prompts/
├── crypto.prompt.md   ← Fokus: CVD, OI, Funding, order-flow patterns
├── forex.prompt.md    ← Fokus: HTF bias, session, institutional levels
└── stocks.prompt.md   ← Fokus: Wyckoff phase, volume structure, MA
```

**Aturan isolasi tetap dijaga ketat:**
- Crypto prompt **tidak boleh** menyebut sessions, macro, atau MA alignment sebagai driver utama
- Forex prompt **tidak boleh** menyebut CVD, funding rate, atau derivative momentum
- Stocks prompt **tidak boleh** menyebut funding, liquidation cascade, atau perpetual futures

---

## 5. Tiga Take-Profit (TARGET 1/2/3)

### Sebelumnya
Hanya TARGET 1 dan TARGET 2.

### Sekarang

```
TARGET 1: 67.240  (R:R 2.0:1)   ← Minimum 2:1, structural extension
TARGET 2: 68.500  (R:R 3.2:1)   ← Nearest swing resistance
TARGET 3: 69.760  (R:R 4.4:1)   ← Extension beyond T2
R:R: 2.0:1 to T1
```

Setiap target menampilkan R:R masing-masing. T3 dihitung sebagai ekstensi struktural beyond T2.

---

## 6. Entry Zone = Pullback Level (Bukan Harga Sekarang)

### Sebelumnya (bug fungsional)
Entry selalu di-pin ke harga saat ini:
```
ENTRY ZONE: 67.850 – 68.000   ← price * 0.997 to price
```
Masalah: kalau harga lagi di resistance, ini berarti kamu masuk tepat di "dinding" — bukan entry yang bagus.

### Sekarang
Entry dihitung dari level struktural (support/MA20):
```
ENTRY ZONE: 66.800 – 67.050 (pullback zone)
```
Untuk long: entry = max(swing support, MA20 − 0.3×ATR)  
Untuk short: entry = min(swing resistance, MA20 + 0.3×ATR)

---

## 7. Extreme / Extended Gate

### Sebelumnya
Tidak ada. Engine bisa rekomendasikan entry meski RSI 80+ atau harga baru saja naik 5% dalam 5 candle.

### Sekarang — No-trade otomatis jika:
- RSI > 75 (overbought ekstrem)
- RSI < 25 (oversold ekstrem)
- Price bergerak > 2×ATR dalam 5 candle terakhir (extended move, jangan chase)

```
BIAS: Bullish
ENTRY ZONE: N/A — wait
R:R: No trade — RSI extreme (78.3) — wait for pullback before entry
WARNINGS: RSI extreme (78.3) — wait for pullback before entry
```

Ini adalah aturan terpenting yang sebelumnya tidak ada.

---

## 8. HTF Bias Parameter

### Sebelumnya
Tidak ada input timeframe yang lebih tinggi. Engine hanya lihat satu timeframe.

### Sekarang
User bisa set **HTF Bias** (Bullish/Bearish/Neutral) — misalnya dari analisis Daily saat analyze chart 1H.

**Efek jika ada konflik:**
- LTF setup Bullish tapi HTF Bias = Bearish → CONFIDENCE otomatis turun ke **Low**
- Warning muncul: `HTF bias (Bearish) conflicts with LTF setup (Bullish) — reduced conviction`

Ini mengimplementasikan aturan SKILL.md: *"Establish HTF bias before LTF entry."*

---

## 9. WARNINGS Field

### Sebelumnya
Peringatan hanya tertanam dalam teks NOTES, mudah terlewat.

### Sekarang
Field `WARNINGS:` terpisah, tampil dalam **kotak amber** di UI:

```
WARNINGS: OHLCV-only — CVD/OI/Funding tidak bisa dibaca dari candles. Gunakan Screenshot mode untuk crypto lengkap. | Extended move (227.5 vs ATR 113.2) — jangan chase
```

Jenis warning yang bisa muncul:

| Warning | Kondisi |
|---|---|
| OHLCV-only disclaimer | Selalu muncul di crypto CSV mode |
| RSI extreme | RSI >75 atau <25 |
| Extended move | Price bergerak >2×ATR dalam 5 candle |
| HTF conflict | HTF Bias berbeda dengan setup LTF |
| Market closed | Forex, chart terdeteksi weekend UTC |
| Volume non-confirming | Stocks, volume bertentangan dengan price direction |

---

## 10. Weekend Guard (Forex)

### Sebelumnya
Tidak ada deteksi market hours. Engine bisa kasih entry signal saat pasar tutup.

### Sekarang
Jika timestamp candle terakhir adalah Sabtu atau Minggu UTC:
```
BIAS: Bullish — PLAN FOR OPEN
WARNINGS: Market closed (weekend) — this is a plan-for-open, not a live entry
```

Analisis tetap diberikan sebagai **rencana untuk open Senin** — bukan sinyal live.

---

## 11. Swing-Based Trend Detection

### Sebelumnya (noise-sensitive)
```js
// Hanya bandingkan ujung pertama vs terakhir
const hhhl = rHighs[len-1] > rHighs[0] && rLows[len-1] > rLows[0];
```
Masalah: satu candle besar di ujung bisa membalik hasil.

### Sekarang (proper swing structure)
```
Scoring sequence swing highs dan swing lows:
- Setiap SH[i] > SH[i-1]  → +1 (Higher High)
- Setiap SH[i] < SH[i-1]  → -1 (Lower High)
- Setiap SL[i] > SL[i-1]  → +1 (Higher Low)
- Setiap SL[i] < SL[i-1]  → -1 (Lower Low)

Ratio ≥ 0.5 → Uptrend
Ratio ≤ -0.5 → Downtrend
Antara → Ranging
```

Output lebih konsisten dan tidak terpengaruh noise satu candle.

---

## 12. Bug Fixes di indicators.js

### RSI NaN pada flat series

**Sebelumnya:**
```js
// Jika avgGain dan avgLoss keduanya 0 (harga flat):
const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss; // Infinity
100 - 100 / (1 + Infinity) = NaN  // ← bug
```

**Sekarang:**
```js
if (avgGain === 0 && avgLoss === 0) { result.push(50); continue; }
// Flat series → RSI netral = 50 ✅
```

### MACD crash jika data tidak cukup

**Sebelumnya:**
```js
// Jika closes.length < slow + signal = 35:
// Array slice dengan offset negatif → hasil salah, atau error
```

**Sekarang:**
```js
if (closes.length < slow + signal) return { macdLine: [], signalLine: [], histogram: [] };
// Callers check array length sebelum akses → no crash ✅
```

---

## 13. OHLCV Disclaimer (Kejujuran)

### Sebelumnya
Comment `// Rules derived from SKILL.md — CRYPTO section` menyesatkan. Code tidak pernah baca CVD/OI/Funding tapi seolah-olah sudah.

### Sekarang
Setiap analisis crypto CSV selalu menyertakan:
```
WARNINGS: OHLCV-only — CVD/OI/Funding not visible from candles.
          Use Screenshot mode for full crypto read.
```

Ini mengatur ekspektasi yang benar: CSV mode untuk crypto hanya memberikan analisis berbasis MA/RSI/MACD — bukan order-flow analysis.

---

## Perbandingan Output Sebelum vs Sesudah

### Sebelumnya (v2.0)
```
BIAS: Bullish
PATTERN: Higher Highs / Higher Lows (uptrend)
ENTRY ZONE: 67.850 – 68.000
STOP: 65.800 (below nearest support (65.864) − 0.3 ATR buffer)
TARGET 1: 70.100
TARGET 2: 67.600
R:R: 2.0:1
CONFIDENCE: Medium
NOTES: RSI 58.1. MACD above signal. Volume expanding.
```

### Sekarang (v3.0)
```
BIAS: Bullish
PATTERN: Higher Highs / Higher Lows (uptrend)
ENTRY ZONE: 66.800 – 67.050 (pullback zone)
STOP: 65.610 (below swing support 65.864 − 0.3×ATR buffer)
TARGET 1: 68.310  (R:R 2.0:1)
TARGET 2: 67.600  (R:R 1.2:1)
TARGET 3: 68.930  (R:R 2.8:1)
R:R: 2.0:1 to T1
CONFIDENCE: Medium
WARNINGS: OHLCV-only — CVD/OI/Funding not visible from candles. Use Screenshot mode for full crypto read.
NOTES: RSI 58.1. MACD above signal. Volume expanding (confirms). ATR: 227.56.

Not financial advice. Technical analysis only.
```

---

## File Baru yang Dibuat di v3.0

| File | Fungsi |
|---|---|
| `client/src/components/ScreenshotInput.jsx` | UI upload screenshot + metadata |
| `server/src/visionAnalyze.js` | Logic kirim ke Claude Vision, parse JSON, format output |
| `server/prompts/crypto.prompt.md` | System prompt crypto: order-flow centered |
| `server/prompts/forex.prompt.md` | System prompt forex: structure/session centered |
| `server/prompts/stocks.prompt.md` | System prompt stocks: Wyckoff/volume centered |

## File yang Diubah di v3.0

| File | Perubahan |
|---|---|
| `client/src/engine/indicators.js` | RSI NaN fix, MACD guard, tambah `detectTrendStructure()` |
| `client/src/engine/crypto.js` | Swing trend, extreme gate, TP3, pullback entry, htfBias, WARNINGS |
| `client/src/engine/forex.js` | Swing trend, TP3, weekend guard, pullback entry, htfBias, WARNINGS |
| `client/src/engine/stocks.js` | Swing trend, extreme gate, TP3, pullback entry, htfBias, WARNINGS |
| `client/src/components/AnalysisResult.jsx` | Tambah render ORDER FLOW, WARNINGS, TARGET 3 |
| `client/src/App.jsx` | Dual-mode UI, screenshot flow, server error handling |
| `client/vite.config.js` | Tambah proxy `/api → localhost:3001` untuk dev |
| `server/src/index.js` | Route baru `POST /api/vision`, hapus route lama |

---

> ⚠️ Not financial advice. Technical analysis tooling only.
