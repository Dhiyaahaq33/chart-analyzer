# MATA ELANG CHART
### chart-analyzer — Asisten Baca Chart Trading (Crypto, Forex, Saham)

## Apa Ini?

Web app yang bantu baca dan analisis chart trading — bisa lewat upload screenshot chart (misalnya dari TradingView atau Coinglass) yang dibaca oleh AI vision (NVIDIA Nemotron Nano VL), atau lewat upload data candle mentah (CSV) yang dianalisis pakai indikator teknikal biasa (SMA, EMA, RSI, MACD, ATR) langsung di browser tanpa perlu server maupun API key. Mendukung tiga jenis market: Crypto, Forex, dan Saham, masing-masing dengan aturan analisis (engine) sendiri. Hasil akhirnya berupa rekomendasi terstruktur: BIAS (bullish/bearish/netral), zona entry, level stop loss, target profit, rasio risk-reward, dan level keyakinan (confidence).

## Fitur Utama

- **Mode CSV** — 100% jalan di browser, tanpa API key/server sama sekali, cukup upload data candle
- **Mode Screenshot** — upload gambar chart, dibaca AI vision (NVIDIA Nemotron Nano VL 8B) untuk ekstrak CVD, Open Interest, Funding Rate, RSI, dll
- **AI Reasoning** (opsional) — penjelasan naratif dari hasil analisis pakai model Nemotron, murni komentar (tidak mengubah angka BIAS/ENTRY/STOP/TARGET yang sudah dihitung)
- **Auto-fetch data** — Funding Rate & Open Interest crypto otomatis dari Binance (gratis, tanpa key); candle Forex/Saham otomatis dari Twelve Data (gratis dengan API key)
- **Deteksi squeeze** — waspada long/short squeeze berdasarkan kombinasi Funding Rate + Open Interest + CVD
- **Validasi silang** — RSI hasil baca AI vision dicek ulang ke RSI hitungan asli dari data candle, kalau meleset jauh (>15 poin) nilai vision diabaikan
- Bisa di-deploy gratis ke GitHub Pages (khusus mode CSV)

## Teknologi yang Dipakai

- React + Vite (folder `client/`) — aplikasi utama di browser
- Node.js + Express (folder `server/`) — proxy API ke NVIDIA & Twelve Data (dibutuhkan karena masalah CORS)
- NVIDIA NIM API (`nvidia/llama-3.1-nemotron-nano-vl-8b-v1` untuk vision, `nvidia/nemotron-3-nano-30b-a3b` untuk reasoning) — gratis, tanpa kartu kredit
- Binance public API (Klines, Funding Rate, Open Interest) — gratis tanpa login
- Twelve Data API — gratis untuk data candle Forex/Saham

## Cara Instalasi

1. Pastikan Node.js terpasang (`node --version` — versi 24.16.0 sudah ada).
2. Install & jalankan client (wajib, mode CSV cukup ini saja):
   ```powershell
   cd "D:\BOT\MONEY\chart-analyzer\client"
   npm install
   ```
3. Kalau mau pakai mode Screenshot / AI Reasoning, install juga server:
   ```powershell
   cd "D:\BOT\MONEY\chart-analyzer\server"
   npm install
   copy .env.example .env
   ```
   Lalu isi `NVIDIA_API_KEY` di `.env` (ambil gratis di https://build.nvidia.com — klik "Get API Key"). Opsional isi juga `TWELVEDATA_API_KEY` untuk auto-fetch candle Forex/Saham (ambil gratis di https://twelvedata.com/pricing).

## Cara Menjalankan

Client (wajib):
```powershell
cd "D:\BOT\MONEY\chart-analyzer\client"
npm run dev
```
Buka `http://localhost:5173/chart-analyzer/`.

Server (kalau butuh mode Screenshot/AI Reasoning — biarkan terminal ini tetap terbuka):
```powershell
cd "D:\BOT\MONEY\chart-analyzer\server"
npm run dev
```
Server jalan di `http://localhost:3001`.

## Catatan Penting

- Untuk mode CSV, tidak butuh API key apapun — 100% aman dan privat, semua kalkulasi di browser sendiri.
- Untuk mode Screenshot/AI Reasoning, `NVIDIA_API_KEY` dan `TWELVEDATA_API_KEY` disimpan di `server/.env` (sudah masuk `.gitignore`) — jangan commit file ini ke Git atau share ke siapapun.
- Hasil analisis AI (baik vision maupun reasoning) adalah alat bantu, **bukan nasihat keuangan** — sudah ada disclaimer resmi di README asli proyek ini juga.
- Riset menunjukkan model vision LLM (termasuk yang bagus sekalipun) cuma ~51-57% akurat baca angka presisi dari gambar chart — karena itu proyek ini punya validasi silang RSI ke data OHLCV asli, tapi tetap hati-hati kalau cuma pakai mode Screenshot tanpa CSV pembanding.

## Kebutuhan API LLM

- **Butuh API LLM?** Sebagian — kalau ada mode analisis/reasoning berbasis screenshot chart (baca pola candlestick lewat AI vision), itu butuh LLM; kalau cuma hitung indikator teknikal murni, tidak butuh.
- **Bisa pakai API Claude (Anthropic)?** Ya — Claude Sonnet 5 punya kemampuan vision yang cocok untuk baca/menganalisis screenshot chart candlestick dan memberi komentar analisis dalam bahasa natural.

## Instalasi & Eksekusi Offline
- **Bisa instalasi offline?** Sebagian — `npm install` di folder `client/` dan `server/` WAJIB online karena narik package (React, Vite, Express, dll) dari registry npm. Kalau sudah pernah diinstall dan ada di cache npm lokal, reinstall ulang bisa offline.
- **Bisa dijalankan offline (setelah terinstall)?** Ya, untuk mode CSV — mode ini 100% jalan di browser tanpa API key/server, jadi bisa offline penuh setelah `npm run dev` client jalan sekali dan asetnya ter-cache browser. Untuk mode Screenshot/AI Reasoning dan fitur auto-fetch Funding Rate/Open Interest/candle, WAJIB online karena butuh panggilan ke API NVIDIA NIM, Binance, dan Twelve Data.
