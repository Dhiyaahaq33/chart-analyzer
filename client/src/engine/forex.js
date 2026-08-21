/**
 * OHLCV forex engine — HTF bias, session context, institutional levels.
 * No CVD / funding / derivative logic (those are crypto-only concepts).
 */
import { sma, rsi, atr, swingHighs, swingLows, detectTrendStructure, fmt } from './indicators.js';

const RR_GATE = 1.5;

function detectSession(timeStr) {
  if (!timeStr || timeStr.startsWith('candle')) return 'Unknown';
  try {
    const d = new Date(timeStr);
    const h = d.getUTCHours();
    if (h >= 12 && h < 16) return 'London-NY Overlap';
    if (h >= 7  && h < 16) return 'London';
    if (h >= 12 && h < 21) return 'New York';
    if (h >= 0  && h < 9)  return 'Asia';
    return 'Unknown';
  } catch { return 'Unknown'; }
}

function isWeekend(timeStr) {
  try {
    const day = new Date(timeStr).getUTCDay(); // 0=Sun, 6=Sat
    return day === 0 || day === 6;
  } catch { return false; }
}

/**
 * @param {Array} candles
 * @param {Object} opts
 * @param {string|null} opts.htfBias
 */
export function analyzeForex(candles, opts = {}) {
  const { htfBias = null } = opts;

  if (candles.length < 50) {
    return out([
      `BIAS: Insufficient data`,
      `NOTES: Need ≥50 candles. Got ${candles.length}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ]);
  }

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const ma20arr  = sma(closes, 20);
  const ma50arr  = sma(closes, 50);
  const ma200arr = candles.length >= 200 ? sma(closes, 200) : null;
  const rsiArr   = rsi(closes, 14);
  const atrArr   = atr(highs, lows, closes, 14);

  const last    = closes.length - 1;
  const price   = closes[last];
  const ma20    = ma20arr[ma20arr.length - 1];
  const ma50    = ma50arr[ma50arr.length - 1];
  const ma200   = ma200arr ? ma200arr[ma200arr.length - 1] : null;
  const lastRsi = rsiArr[rsiArr.length - 1];
  const lastAtr = atrArr[atrArr.length - 1];

  // ── Session + weekend check ──────────────────────────────
  const session    = detectSession(candles[last].time);
  const weekend    = isWeekend(candles[last].time);
  const warnings   = [];
  if (weekend) warnings.push('Market closed (weekend) — this is a plan-for-open, not a live entry');

  // ── HTF bias via MA alignment ────────────────────────────
  let bias = 'Neutral';
  if (ma200) {
    if (price > ma50 && price > ma200 && ma50 > ma200)   bias = 'Bullish';
    else if (price < ma50 && price < ma200 && ma50 < ma200) bias = 'Bearish';
  } else {
    // 0.5×ATR buffer around MA20 for consistency with crypto/stocks — see those
    // engines for why a bare pullback-to-MA20 shouldn't flip bias to Neutral.
    const maBuffer = lastAtr * 0.5;
    if (price > ma20 - maBuffer && price > ma50 && ma20 > ma50)     bias = 'Bullish';
    else if (price < ma20 + maBuffer && price < ma50 && ma20 < ma50) bias = 'Bearish';
  }

  // ── HTF conflict check ───────────────────────────────────
  const htfConflict = htfBias && htfBias !== 'Neutral' && htfBias !== bias;
  if (htfConflict) warnings.push(`HTF bias (${htfBias}) conflicts with LTF setup — reduced conviction`);

  // ── Swing structure ──────────────────────────────────────
  const { structure, sh, sl } = detectTrendStructure(highs, lows, 50, 5);

  // ── Key levels ───────────────────────────────────────────
  const nearestRes  = sh.filter(p => p > price).sort((a, b) => a - b)[0] ?? price + lastAtr * 2;
  const nearestSup  = sl.filter(p => p < price).sort((a, b) => b - a)[0] ?? price - lastAtr * 2;

  // Round number proximity
  const roundUnit    = price > 10 ? 1 : price > 1 ? 0.1 : 0.001;
  const nearestRound = Math.round(price / roundUnit) * roundUnit;
  const atRoundLevel = Math.abs(price - nearestRound) / lastAtr < 0.5;

  // ── Candlestick signal ───────────────────────────────────
  const prev = candles[last - 1];
  const curr = candles[last];
  const body  = Math.abs(curr.close - curr.open);
  const range = curr.high - curr.low;
  const isPinBar    = range > 0 && body / range < 0.35 && range > lastAtr * 0.7;
  const isEngulfing = body > Math.abs(prev.close - prev.open) * 1.5 &&
    ((curr.close > curr.open && prev.close < prev.open) ||
     (curr.close < curr.open && prev.close > prev.open));
  const candleNote = isPinBar ? 'Pin bar' : isEngulfing ? 'Engulfing candle' : 'No strong trigger';

  // ── Extended move gate ───────────────────────────────────
  const recentMove  = Math.abs(price - candles[Math.max(0, last - 5)].close);
  const extendedMove = recentMove > lastAtr * 2;
  if (extendedMove) warnings.push(`Extended move (${fmt(recentMove)} over 5 bars vs ATR ${fmt(lastAtr)}) — avoid chasing`);

  // ── Key level driving the setup ──────────────────────────
  const keyLevel = bias === 'Bullish' ? nearestSup : nearestRes;
  const pattern  =
    structure === 'uptrend'   ? 'HH/HL uptrend structure' :
    structure === 'downtrend' ? 'LH/LL downtrend structure' : 'Consolidation / Ranging';

  // ── Early exits ──────────────────────────────────────────
  if (bias === 'Neutral') {
    return out([
      `BIAS: Neutral`,
      `SESSION: ${session}`,
      `KEY LEVEL: Res ${fmt(nearestRes)} / Sup ${fmt(nearestSup)}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: N/A`,
      `STOP: N/A`,
      `TARGET 1: N/A`,
      `R:R: No trade — no clear HTF bias`,
      `CONFIDENCE: Low`,
      warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
      `NOTES: MAs not aligned. ${candleNote}. RSI ${lastRsi.toFixed(1)}. Session: ${session}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ].filter(Boolean));
  }

  if (extendedMove) {
    return out([
      `BIAS: ${bias}`,
      `SESSION: ${session}`,
      `KEY LEVEL: ${fmt(keyLevel)}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: N/A — wait for retracement`,
      `STOP: N/A`,
      `TARGET 1: N/A`,
      `R:R: No trade — extended move`,
      `CONFIDENCE: Low`,
      `WARNINGS: ${warnings.join(' | ')}`,
      `NOTES: Price moved ${fmt(recentMove)} over 5 bars (ATR: ${fmt(lastAtr)}). Wait for retracement to ${bias === 'Bullish' ? fmt(ma20) : fmt(ma20)} area before entry.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ]);
  }

  // ── Entry / Stop / Targets (pullback-anchored) ───────────
  let entryLow, entryHigh, entryMid, stopLevel, stopReason, t1, t2, t3;

  if (bias === 'Bullish') {
    entryLow  = nearestSup;
    entryHigh = nearestSup + lastAtr * 0.3;
    entryMid  = (entryLow + entryHigh) / 2;
    stopLevel = nearestSup - lastAtr * 0.5;
    stopReason = `below support ${fmt(nearestSup)} − 0.5 ATR`;
    const risk = entryMid - stopLevel;
    t1 = entryMid + risk * 1.5;
    t2 = nearestRes;
    t3 = nearestRes + (nearestRes - entryMid);
  } else {
    entryLow  = nearestRes - lastAtr * 0.3;
    entryHigh = nearestRes;
    entryMid  = (entryLow + entryHigh) / 2;
    stopLevel = nearestRes + lastAtr * 0.5;
    stopReason = `above resistance ${fmt(nearestRes)} + 0.5 ATR`;
    const risk = stopLevel - entryMid;
    t1 = entryMid - risk * 1.5;
    t2 = nearestSup;
    t3 = nearestSup - (entryMid - nearestSup);
  }

  const entryZone = `${fmt(entryLow)} – ${fmt(entryHigh)} (at key level${atRoundLevel ? ', round number' : ''})`;
  const risk    = Math.abs(entryMid - stopLevel);
  const rr1     = Math.abs(t1 - entryMid) / risk;
  const rr2     = Math.abs(t2 - entryMid) / risk;
  const rr3     = Math.abs(t3 - entryMid) / risk;

  if (rr1 < RR_GATE) {
    return out([
      `BIAS: ${bias}`,
      `SESSION: ${session}`,
      `KEY LEVEL: ${fmt(keyLevel)}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: ${entryZone}`,
      `STOP: ${fmt(stopLevel)} (${stopReason})`,
      `TARGET 1: ${fmt(t1)}  (R:R ${rr1.toFixed(2)}:1)`,
      `R:R: No trade — unfavorable R:R (${rr1.toFixed(2)}:1, gate ≥ ${RR_GATE}:1)`,
      `CONFIDENCE: Low`,
      warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
      `NOTES: ${candleNote}. RSI ${lastRsi.toFixed(1)}. ATR: ${fmt(lastAtr)} pips.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ].filter(Boolean));
  }

  // ── Confidence ───────────────────────────────────────────
  let score = 0;
  if (atRoundLevel) score++;
  if (isPinBar || isEngulfing) score++;
  if (session === 'London' || session === 'New York' || session === 'London-NY Overlap') score++;
  if ((bias === 'Bullish' && lastRsi < 60) || (bias === 'Bearish' && lastRsi > 40)) score++;
  if ((structure === 'uptrend' && bias === 'Bullish') || (structure === 'downtrend' && bias === 'Bearish')) score++;
  let confidence = score >= 4 ? 'High' : score >= 2 ? 'Medium' : 'Low';
  if (htfConflict) confidence = 'Low';

  const htfNote = ma200 ? `MA200 ${fmt(ma200)} confirms HTF bias.` : `MA50 ${fmt(ma50)} (200 not available).`;

  return out([
    `BIAS: ${bias}${weekend ? ' — PLAN FOR OPEN' : ''}`,
    `SESSION: ${session}`,
    `KEY LEVEL: ${fmt(keyLevel)}${atRoundLevel ? ' (round number)' : ''}`,
    `PATTERN: ${pattern}`,
    `ENTRY ZONE: ${entryZone}`,
    `STOP: ${fmt(stopLevel)} (${stopReason})`,
    `TARGET 1: ${fmt(t1)}  (R:R ${rr1.toFixed(1)}:1)`,
    `TARGET 2: ${fmt(t2)}  (R:R ${rr2.toFixed(1)}:1)`,
    `TARGET 3: ${fmt(t3)}  (R:R ${rr3.toFixed(1)}:1)`,
    `R:R: ${rr1.toFixed(1)}:1 to T1`,
    `CONFIDENCE: ${confidence}`,
    warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
    `NOTES: ${htfNote} ${candleNote} at key level. Session: ${session}. RSI ${lastRsi.toFixed(1)}.`,
    ``,
    `Not financial advice. Technical analysis only.`,
  ].filter(Boolean));
}

function out(arr) { return arr.join('\n'); }
