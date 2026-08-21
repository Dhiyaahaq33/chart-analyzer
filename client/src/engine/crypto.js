/**
 * Crypto analysis engine — OHLCV base + optional order-flow enrichment.
 *
 * When fundingRate / openInterest / cvdTrend / geminiExtract are provided
 * (fetched from Binance or extracted by Gemini), the engine uses them to
 * apply squeeze rules, adjust confidence, and output ORDER FLOW summary.
 *
 * When they are NOT provided, a disclaimer is added to WARNINGS and the
 * output is clearly marked OHLCV-only.
 */
import {
  sma, rsi, atr, macd,
  swingHighs, swingLows, detectTrendStructure,
  cvdApprox, cvdTrend as calcCvdTrend,
  fmt,
} from './indicators.js';
import { formatFR, formatOI, TREND_ARROW } from './fetchFuturesData.js';

const RR_GATE = 2.0;

/**
 * @param {Array}  candles   [{time,open,high,low,close,volume}]
 * @param {Object} opts
 * @param {string|null}  opts.htfBias      — 'Bullish'|'Bearish'|'Neutral'|null
 * @param {string}       opts.tradeStyle   — 'scalp'|'swing'|'position'
 * @param {{ value:number, trend:string, extreme:boolean }|null} opts.fundingRate
 * @param {{ value:number, trend:string }|null}                  opts.openInterest
 * @param {'bullish'|'bearish'|'neutral'|null}                   opts.cvdTrend
 * @param {Object|null}  opts.geminiExtract  — raw Gemini-extracted values
 */
export function analyzeCrypto(candles, opts = {}) {
  const {
    htfBias      = null,
    fundingRate  = null,   // { value, trend, extreme }
    openInterest = null,   // { value, trend }
    cvdTrend: extCvdTrend = null,
    geminiExtract = null,
  } = opts;

  // ── Determine data richness ──────────────────────────────
  const hasOrderFlow = fundingRate != null || openInterest != null || extCvdTrend != null;
  const hasGemini    = geminiExtract != null;

  if (candles.length < 50) {
    return out([
      `BIAS: Insufficient data`,
      `NOTES: Need ≥50 candles. Got ${candles.length}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ]);
  }

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // ── Indicators ───────────────────────────────────────────
  const ma20arr = sma(closes, 20);
  const ma50arr = sma(closes, 50);
  const rsiArr  = rsi(closes, 14);
  const atrArr  = atr(highs, lows, closes, 14);
  const { macdLine, signalLine } = macd(closes);

  const last    = closes.length - 1;
  const price   = closes[last];
  const ma20    = ma20arr[ma20arr.length - 1];
  const ma50    = ma50arr[ma50arr.length - 1];
  const lastAtr = atrArr[atrArr.length - 1];

  // Claim validation: vision-read RSI is only trusted if it's reasonably close to the
  // RSI computed from real OHLCV data. Vision LLMs misread chart values often enough
  // that a wild claim (e.g. off by >15 points) is more likely a misread than a more
  // current live value — fall back to the computed one and flag it instead.
  const calcRsi = rsiArr[rsiArr.length - 1];
  let lastRsi = calcRsi;
  let rsiMismatch = false;
  if (hasGemini && geminiExtract.rsi != null) {
    if (Math.abs(geminiExtract.rsi - calcRsi) > 15) rsiMismatch = true;
    else lastRsi = geminiExtract.rsi;
  }

  // MACD safe access
  const hasMacd   = macdLine.length >= 2 && signalLine.length >= 2;
  const mLine     = hasMacd ? macdLine[macdLine.length - 1]     : null;
  const sLine     = hasMacd ? signalLine[signalLine.length - 1] : null;
  const mLinePrev = hasMacd ? macdLine[macdLine.length - 2]     : null;
  const sLinePrev = hasMacd ? signalLine[signalLine.length - 2] : null;

  // ── CVD (approximated from candles, overridden by external if provided) ──
  const cvdArr      = cvdApprox(candles);
  const cvdFromOhlcv = calcCvdTrend(cvdArr, 20);
  const cvdBias     = extCvdTrend ?? cvdFromOhlcv; // external overrides calculated

  // ── Swing-based trend structure ──────────────────────────
  const { structure, sh, sl } = detectTrendStructure(highs, lows, 50, 4);
  const pattern =
    structure === 'uptrend'   ? 'Higher Highs / Higher Lows (uptrend)' :
    structure === 'downtrend' ? 'Lower Highs / Lower Lows (downtrend)' :
                                'Consolidation / Ranging';

  // ── Bias (MA alignment) ──────────────────────────────────
  // A 0.5×ATR buffer around MA20 lets a normal pullback-to-MA20 still count as
  // aligned — without it, the entry logic below (which explicitly targets a
  // pullback to MA20) can never fire: the moment price touches MA20, bias would
  // flip to Neutral and gate the exact entry it was waiting for.
  const maBuffer = lastAtr * 0.5;
  let bias = 'Neutral';
  if (price > ma20 - maBuffer && price > ma50 && ma20 > ma50) bias = 'Bullish';
  else if (price < ma20 + maBuffer && price < ma50 && ma20 < ma50) bias = 'Bearish';

  // Override/supplement with Gemini visual trend if candle bias is neutral
  if (bias === 'Neutral' && hasGemini && geminiExtract.trend_visual) {
    if (geminiExtract.trend_visual === 'bullish') bias = 'Bullish';
    else if (geminiExtract.trend_visual === 'bearish') bias = 'Bearish';
  }

  // ── Warnings ─────────────────────────────────────────────
  const warnings = [];
  if (!hasOrderFlow) {
    warnings.push('OHLCV-only — CVD/OI/Funding not available. Use Screenshot mode or type symbol for full crypto read.');
  }
  if (rsiMismatch) {
    warnings.push(`Vision RSI (${geminiExtract.rsi.toFixed(1)}) meleset jauh dari OHLCV RSI (${calcRsi.toFixed(1)}) — pakai nilai OHLCV`);
  }

  // ── Extreme / Extended gate ──────────────────────────────
  const rsiExtreme   = lastRsi > 75 || lastRsi < 25;
  const recentMove   = Math.abs(price - closes[Math.max(0, last - 5)]);
  const extendedMove = recentMove > lastAtr * 2;

  if (rsiExtreme || extendedMove) {
    const reason = rsiExtreme
      ? `RSI extreme (${lastRsi.toFixed(1)}) — wait for pullback before entry`
      : `Extended move (${fmt(recentMove)} over 5 candles vs ATR ${fmt(lastAtr)}) — do not chase`;
    warnings.push(reason);
    return out([
      `BIAS: ${bias}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: N/A — wait`,
      `STOP: N/A`,
      `TARGET 1: N/A`,
      `R:R: No trade — ${reason}`,
      `CONFIDENCE: Low`,
      `WARNINGS: ${warnings.join(' | ')}`,
      `NOTES: Momentum extreme. Do not enter until RSI resets to 40–60 or price pulls back to MA20 (${fmt(ma20)}).`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ]);
  }

  // ── Order flow squeeze rules ─────────────────────────────
  const fr       = fundingRate?.value  ?? null;
  const frTrend  = fundingRate?.trend  ?? 'neutral';
  const frExtreme = fundingRate?.extreme ?? false;
  const oiTrend  = openInterest?.trend ?? 'neutral';

  // Long squeeze: FR extreme positive + OI rising + CVD bearish
  if (frExtreme && fr > 0 && oiTrend === 'rising' && cvdBias === 'bearish') {
    warnings.push(`⚠ Long squeeze risk — FR ${formatFR(fr)} (extreme+), OI rising, CVD bearish`);
    if (bias === 'Bullish') bias = 'Avoid';
  }
  // Short squeeze: FR extreme negative + OI rising + CVD bullish
  if (frExtreme && fr < 0 && oiTrend === 'rising' && cvdBias === 'bullish') {
    warnings.push(`⚠ Short squeeze risk — FR ${formatFR(fr)} (extreme−), OI rising, CVD bullish`);
    if (bias === 'Bearish') bias = 'Avoid';
  }
  // Any extreme FR → crowded-position flush risk
  if (frExtreme) {
    warnings.push(`Extreme funding ${formatFR(fr)} — crowded position flush risk, reduce size`);
  }

  // ── HTF conflict check ───────────────────────────────────
  const htfConflict = htfBias && htfBias !== 'Neutral' && htfBias !== bias;
  if (htfConflict) warnings.push(`HTF bias (${htfBias}) conflicts with LTF setup (${bias}) — reduced conviction`);

  // ── Volume ───────────────────────────────────────────────
  const avgVol  = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const geminiVol = hasGemini && geminiExtract.volume_note;
  const volNote = geminiVol
    ? `${geminiExtract.volume_note} (vision)`
    : volumes[last] > avgVol ? 'expanding (confirms)' : 'contracting (watch)';

  // ── RSI note ─────────────────────────────────────────────
  const rsiSource = (hasGemini && geminiExtract.rsi != null && !rsiMismatch) ? ' (vision)' : '';
  let rsiNote = `RSI ${lastRsi.toFixed(1)}${rsiSource}`;
  if (lastRsi > 70) rsiNote += ' — overbought';
  else if (lastRsi < 30) rsiNote += ' — oversold';

  // ── MACD note ────────────────────────────────────────────
  let macdNote = 'MACD: insufficient data';
  if (hasMacd) {
    if (mLinePrev < sLinePrev && mLine > sLine)      macdNote = 'MACD bullish cross';
    else if (mLinePrev > sLinePrev && mLine < sLine) macdNote = 'MACD bearish cross';
    else macdNote = mLine > sLine ? 'MACD above signal' : 'MACD below signal';
  }

  // ── S/R levels ───────────────────────────────────────────
  const nearestRes = sh.filter(p => p > price).sort((a, b) => a - b)[0] ?? price + lastAtr * 3;
  const nearestSup = sl.filter(p => p < price).sort((a, b) => b - a)[0] ?? price - lastAtr * 3;

  // ── Early exit: Avoid or Neutral ──────────────────────────
  if (bias === 'Neutral' || bias === 'Avoid') {
    return out([
      `BIAS: ${bias}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: N/A`,
      `STOP: N/A`,
      `TARGET 1: N/A`,
      `R:R: No trade — ${bias === 'Avoid' ? 'squeeze risk' : 'no clear bias'}`,
      `CONFIDENCE: Low`,
      buildOrderFlow(fr, frTrend, frExtreme, openInterest, cvdBias, geminiExtract),
      `WARNINGS: ${warnings.join(' | ')}`,
      `NOTES: MA20 (${fmt(ma20)}) and MA50 (${fmt(ma50)}) not aligned. ${rsiNote}. ${macdNote}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ].filter(Boolean));
  }

  // ── Entry zone (pullback level) ───────────────────────────
  let entryLow, entryHigh, entryMid, stopLevel, stopReason, t1, t2, t3;

  if (bias === 'Bullish') {
    const pullbackBase = Math.max(nearestSup, ma20 - lastAtr * 0.3);
    entryLow  = pullbackBase;
    entryHigh = pullbackBase + lastAtr * 0.4;
    entryMid  = (entryLow + entryHigh) / 2;
    stopLevel = nearestSup - lastAtr * 0.3;
    stopReason = `below swing support ${fmt(nearestSup)} − 0.3×ATR buffer`;
    const risk = entryMid - stopLevel;
    t1 = entryMid + risk * 2;
    t2 = nearestRes;
    t3 = nearestRes + (nearestRes - entryMid);
  } else {
    const pullbackBase = Math.min(nearestRes, ma20 + lastAtr * 0.3);
    entryLow  = pullbackBase - lastAtr * 0.4;
    entryHigh = pullbackBase;
    entryMid  = (entryLow + entryHigh) / 2;
    stopLevel = nearestRes + lastAtr * 0.3;
    stopReason = `above swing resistance ${fmt(nearestRes)} + 0.3×ATR buffer`;
    const risk = stopLevel - entryMid;
    t1 = entryMid - risk * 2;
    t2 = nearestSup;
    t3 = nearestSup - (entryMid - nearestSup);
  }

  const entryZone = `${fmt(entryLow)} – ${fmt(entryHigh)} (pullback zone)`;

  // ── R:R ──────────────────────────────────────────────────
  const risk    = Math.abs(entryMid - stopLevel);
  const rr1     = Math.abs(t1 - entryMid) / risk;
  const rr2     = Math.abs(t2 - entryMid) / risk;
  const rr3     = Math.abs(t3 - entryMid) / risk;

  if (rr1 < RR_GATE) {
    return out([
      `BIAS: ${bias}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: ${entryZone}`,
      `STOP: ${fmt(stopLevel)} (${stopReason})`,
      `TARGET 1: ${fmt(t1)}  (R:R ${rr1.toFixed(2)}:1)`,
      `R:R: No trade — unfavorable R:R (${rr1.toFixed(2)}:1, gate ≥ ${RR_GATE}:1)`,
      `CONFIDENCE: Low`,
      buildOrderFlow(fr, frTrend, frExtreme, openInterest, cvdBias, geminiExtract),
      warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
      `NOTES: ${rsiNote}. ${macdNote}. Volume ${volNote}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ].filter(Boolean));
  }

  // ── Confidence score ─────────────────────────────────────
  let score = 0;
  if (structure === 'uptrend'   && bias === 'Bullish') score++;
  if (structure === 'downtrend' && bias === 'Bearish') score++;
  if (volumes[last] > avgVol) score++;
  if (hasMacd && ((bias === 'Bullish' && mLine > sLine) || (bias === 'Bearish' && mLine < sLine))) score++;
  if ((bias === 'Bullish' && lastRsi < 70) || (bias === 'Bearish' && lastRsi > 30)) score++;
  // Bonus: FR neutral + OI rising + CVD agrees with bias
  if (hasOrderFlow && !frExtreme && oiTrend === 'rising' && cvdBias === bias.toLowerCase()) score++;

  let confidence = score >= 4 ? 'High' : score >= 2 ? 'Medium' : 'Low';
  if (htfConflict) confidence = 'Low';

  return out([
    `BIAS: ${bias}`,
    `PATTERN: ${pattern}`,
    `ENTRY ZONE: ${entryZone}`,
    `STOP: ${fmt(stopLevel)} (${stopReason})`,
    `TARGET 1: ${fmt(t1)}  (R:R ${rr1.toFixed(1)}:1)`,
    `TARGET 2: ${fmt(t2)}  (R:R ${rr2.toFixed(1)}:1)`,
    `TARGET 3: ${fmt(t3)}  (R:R ${rr3.toFixed(1)}:1)`,
    `R:R: ${rr1.toFixed(1)}:1 to T1`,
    `CONFIDENCE: ${confidence}`,
    buildOrderFlow(fr, frTrend, frExtreme, openInterest, cvdBias, geminiExtract),
    warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
    `NOTES: ${rsiNote}. ${macdNote}. Volume ${volNote}. ATR: ${fmt(lastAtr)}.`,
    ``,
    `Not financial advice. Technical analysis only.`,
  ].filter(Boolean));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildOrderFlow(fr, frTrend, frExtreme, oi, cvdBias, gemini) {
  const parts = [];

  // Spot CVD: prefer Gemini visual, fall back to OHLCV approximation
  const spotCvdRaw = gemini?.cvd_spot;
  if (spotCvdRaw != null) {
    parts.push(`Spot CVD: ${spotCvdRaw > 0 ? 'Positive ↑' : 'Negative ↓'} (vision)`);
  } else if (cvdBias !== 'neutral') {
    parts.push(`Spot CVD: ${cvdBias === 'bullish' ? 'Positive ↑' : 'Negative ↓'} (OHLCV approx)`);
  }

  // Futures CVD from Gemini
  const futCvdRaw = gemini?.cvd_futures;
  if (futCvdRaw != null) {
    parts.push(`Futures CVD: ${futCvdRaw > 0 ? 'Positive' : 'Negative'} (vision)`);
  }

  // OI from Binance
  if (oi?.value != null) {
    parts.push(`OI: ${formatOI(oi.value)} ${TREND_ARROW[oi.trend] ?? '→'}`);
  } else if (gemini?.open_interest != null) {
    parts.push(`OI: ${formatOI(gemini.open_interest)} (vision)`);
  }

  // FR from Binance
  if (fr != null) {
    parts.push(`FR: ${formatFR(fr)} ${TREND_ARROW[frTrend] ?? '→'}${frExtreme ? ' ⚠EXTREME' : ''}`);
  } else if (gemini?.funding_rate != null) {
    parts.push(`FR: ${formatFR(gemini.funding_rate)} (vision)`);
  }

  return parts.length ? `ORDER FLOW: ${parts.join(' · ')}` : null;
}

function out(arr) { return arr.join('\n'); }
