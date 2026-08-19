import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { analyzeImage } from './visionAnalyze.js';
import { getNemotronReasoning } from './nemotronReasoning.js';
import { extractChartData } from './visionExtract.js';
import { fetchOhlcv } from './fetchOhlcv.js';

const app  = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://dhiyaahaq33.github.io',
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (curl, Postman) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(express.json({ limit: '15mb' })); // chart screenshots as base64 JSON

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, WEBP, or GIF images accepted.'), ok);
  },
});

// ── POST /api/vision — screenshot analysis via NVIDIA (MiniMax M3) vision ─────
app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY is not set on the server.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }

  const { market, symbol, timeframe, tradeStyle, htfBias } = req.body;
  if (!market || !['crypto', 'forex', 'stocks'].includes(market)) {
    return res.status(400).json({ error: 'Invalid market. Use "crypto", "forex", or "stocks".' });
  }

  try {
    const result = await analyzeImage({
      assetClass:  market,
      base64Image: req.file.buffer.toString('base64'),
      mediaType:   req.file.mimetype,
      symbol:      symbol  || 'Unknown',
      timeframe:   timeframe || 'Unknown',
      tradeStyle:  tradeStyle || 'swing',
      htfBias:     htfBias || null,
      apiKey:      process.env.NVIDIA_API_KEY,
    });

    if (result.error) {
      console.error('Vision analysis error:', result.error);
      return res.status(502).json({ error: result.error, partial: result.partial });
    }

    res.json({ analysis: result.analysis });
  } catch (err) {
    console.error('Unhandled error in /api/vision:', err);
    res.status(500).json({ error: err.message || 'Analysis failed.' });
  }
});

// ── POST /api/vision-extract — CVD/OI/Funding/RSI/trend from screenshot via NVIDIA VLM ──
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
app.post('/api/vision-extract', async (req, res) => {
  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY is not set on the server.' });
  }
  const { image, mimeType } = req.body;
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing "image" (base64) in request body.' });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: 'mimeType must be one of ' + ALLOWED_IMAGE_TYPES.join(', ') });
  }

  try {
    const extracted = await extractChartData(image, mimeType, process.env.NVIDIA_API_KEY);
    res.json({ extracted });
  } catch (err) {
    console.error('Vision extract error:', err);
    res.status(502).json({ error: err.message || 'Vision extraction failed.' });
  }
});

// ── POST /api/nemotron-reasoning — plain-language commentary via NVIDIA Nemotron ──
app.post('/api/nemotron-reasoning', async (req, res) => {
  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY is not set on the server.' });
  }
  const { analysis } = req.body;
  if (!analysis || typeof analysis !== 'string') {
    return res.status(400).json({ error: 'Missing "analysis" text in request body.' });
  }

  try {
    const reasoning = await getNemotronReasoning(analysis, process.env.NVIDIA_API_KEY);
    res.json({ reasoning });
  } catch (err) {
    console.error('Nemotron reasoning error:', err);
    res.status(502).json({ error: err.message || 'Nemotron request failed.' });
  }
});

// ── POST /api/ohlcv — Forex/Stocks candle auto-fetch via Twelve Data (crypto uses Binance directly, no server) ──
app.post('/api/ohlcv', async (req, res) => {
  if (!process.env.TWELVEDATA_API_KEY) {
    return res.status(500).json({ error: 'TWELVEDATA_API_KEY is not set on the server.' });
  }
  const { symbol, interval, market } = req.body;
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Missing "symbol" in request body.' });
  }
  if (!market || !['forex', 'stocks'].includes(market)) {
    return res.status(400).json({ error: 'Invalid market. Use "forex" or "stocks".' });
  }

  try {
    const result = await fetchOhlcv(symbol, interval, market, process.env.TWELVEDATA_API_KEY);
    if (result.error) return res.status(502).json({ error: result.error });
    res.json({ candles: result.candles });
  } catch (err) {
    console.error('OHLCV fetch error:', err);
    res.status(502).json({ error: err.message || 'OHLCV fetch failed.' });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Chart Analyzer server on http://localhost:${PORT}`);
    console.log(`NVIDIA key: ${process.env.NVIDIA_API_KEY ? '✅ set' : '❌ MISSING'}`);
    console.log(`Twelve Data key: ${process.env.TWELVEDATA_API_KEY ? '✅ set' : '❌ MISSING'}`);
  });
}

export default app;
