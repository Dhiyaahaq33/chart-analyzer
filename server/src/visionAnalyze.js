/**
 * Vision-based chart analyzer.
 * Accepts a base64 image + metadata, calls NVIDIA's hosted MiniMax M3 (build.nvidia.com NIM)
 * with the asset-class-specific system prompt, and returns the same
 * structured text format as the OHLCV engines.
 *
 * This is the ONLY path that can read CVD / OI / Funding — because
 * those require visual reading from a screenshot (e.g. Coinglass).
 * Never route a screenshot through the OHLCV engines.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseJsonLoose } from './visionExtract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const PROMPT_FILES = {
  crypto: join(__dirname, '../prompts/crypto.prompt.md'),
  forex:  join(__dirname, '../prompts/forex.prompt.md'),
  stocks: join(__dirname, '../prompts/stocks.prompt.md'),
};

// Load prompt files once at module init
const PROMPTS = {};
for (const [key, path] of Object.entries(PROMPT_FILES)) {
  try {
    PROMPTS[key] = readFileSync(path, 'utf8');
  } catch (e) {
    console.error(`Failed to load prompt file for ${key}: ${e.message}`);
  }
}

const REQUIRED_KEYS = ['bias', 'pattern', 'entryZone', 'stop', 'target1', 'rr', 'confidence', 'notes'];
const MODEL = 'minimaxai/minimax-m3'; // vision-capable MoE, free via NVIDIA build API

/**
 * @param {Object} opts
 * @param {string}  opts.assetClass  — 'crypto' | 'forex' | 'stocks'
 * @param {string}  opts.base64Image — base64-encoded image
 * @param {string}  opts.mediaType   — 'image/jpeg' | 'image/png' | 'image/webp'
 * @param {string}  [opts.symbol]    — e.g. 'BTCUSDT', 'EURUSD', 'AAPL'
 * @param {string}  [opts.timeframe] — e.g. '1H', '4H', 'D'
 * @param {string}  [opts.tradeStyle] — 'scalp' | 'swing' | 'position'
 * @param {string}  [opts.htfBias]   — 'Bullish' | 'Bearish' | 'Neutral'
 * @param {string}  opts.apiKey      — NVIDIA API key (from server env only)
 * @returns {Promise<{analysis: string}|{error: string}>}
 */
export async function analyzeImage(opts) {
  const {
    assetClass, base64Image, mediaType,
    symbol = 'Unknown', timeframe = 'Unknown',
    tradeStyle = 'swing', htfBias = null,
    apiKey,
  } = opts;

  if (!PROMPTS[assetClass]) {
    return { error: `Unknown asset class: "${assetClass}". Use crypto, forex, or stocks.` };
  }

  const htfNote = htfBias && htfBias !== 'Neutral'
    ? ` HTF bias provided by user: ${htfBias} — factor this into confidence scoring.`
    : '';

  const userText =
    `Asset: ${symbol}, Timeframe: ${timeframe}, Style: ${tradeStyle}.${htfNote} ` +
    `Read the chart and ALL visible sub-panels (Spot CVD, Futures CVD, Open Interest, Funding Rate, RSI, Volume). ` +
    `If a panel is not visible, set its value to "Not visible" and lower confidence accordingly. ` +
    `Do NOT invent or hallucinate metric values you cannot see. ` +
    `Return ONLY the JSON object — no markdown fences, no extra text.`;

  let raw = '';
  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: PROMPTS[assetClass] },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64Image}` } },
              { type: 'text', text: userText },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { error: `NVIDIA API error: ${data.error?.message || `HTTP ${response.status}`}` };
    }
    raw = data.choices[0]?.message?.content ?? '';
  } catch (e) {
    return { error: `NVIDIA API error: ${e.message}` };
  }

  let parsed;
  try {
    parsed = parseJsonLoose(raw);
  } catch {
    // Return raw text as plain analysis rather than hard-failing
    return { analysis: raw || 'Vision model returned no parseable output.' };
  }

  // Validate required keys
  const missing = REQUIRED_KEYS.filter(k => !(k in parsed));
  if (missing.length > 0) {
    return {
      error: `Vision model response missing required fields: ${missing.join(', ')}`,
      partial: formatOutput(parsed, assetClass),
    };
  }

  return { analysis: formatOutput(parsed, assetClass) };
}

// ─── Format JSON → same text format as OHLCV engines ────────────────────────

function formatOutput(d, assetClass) {
  const lines = [];

  // Bias
  lines.push(`BIAS: ${d.bias ?? 'Unknown'}`);

  // Asset-class specific header fields
  if (assetClass === 'forex') {
    if (d.session)   lines.push(`SESSION: ${d.session}`);
    if (d.keyLevel)  lines.push(`KEY LEVEL: ${d.keyLevel}`);
  }
  if (assetClass === 'stocks') {
    if (d.phase)         lines.push(`PHASE: ${d.phase}`);
    if (d.volumeSignal)  lines.push(`VOLUME SIGNAL: ${d.volumeSignal}`);
  }

  lines.push(`PATTERN: ${d.pattern ?? 'Not identified'}`);
  lines.push(`ENTRY ZONE: ${d.entryZone ?? 'N/A'}`);
  lines.push(`STOP: ${d.stop ?? 'N/A'}`);

  // Targets with per-target R:R
  if (d.target1) lines.push(`TARGET 1: ${d.target1}${d.rr1 ? `  (R:R ${Number(d.rr1).toFixed(1)}:1)` : ''}`);
  if (d.target2) lines.push(`TARGET 2: ${d.target2}${d.rr2 ? `  (R:R ${Number(d.rr2).toFixed(1)}:1)` : ''}`);
  if (d.target3) lines.push(`TARGET 3: ${d.target3}${d.rr3 ? `  (R:R ${Number(d.rr3).toFixed(1)}:1)` : ''}`);

  lines.push(`R:R: ${d.rr ?? 'N/A'}`);
  lines.push(`CONFIDENCE: ${d.confidence ?? 'Low'}`);

  // Order flow — crypto screenshot only
  if (assetClass === 'crypto' && d.orderFlow) {
    const of = d.orderFlow;
    const parts = [
      of.spotCvd     ? `Spot CVD: ${of.spotCvd}`         : null,
      of.futuresCvd  ? `Futures CVD: ${of.futuresCvd}`   : null,
      of.openInterest ? `OI: ${of.openInterest}`          : null,
      of.funding     ? `Funding: ${of.funding}`           : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`ORDER FLOW: ${parts.join(' · ')}`);
  }

  // Warnings
  if (d.warnings && d.warnings.length) {
    lines.push(`WARNINGS: ${Array.isArray(d.warnings) ? d.warnings.join(' | ') : d.warnings}`);
  }

  lines.push(`NOTES: ${d.notes ?? ''}`);
  lines.push('');
  lines.push('Not financial advice. Technical analysis only.');

  return lines.join('\n');
}
