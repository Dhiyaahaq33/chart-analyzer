/**
 * OHLCV stocks engine — Wyckoff phases, volume structure, MA alignment.
 * No CVD / funding / derivative logic (those are crypto-only concepts).
 */
import { sma, rsi, atr, swingHighs, swingLows, detectTrendStructure, fmt } from './indicators.js';

const RR_GATE = 2.0;

function detectWyckoffPhase(price, closes, volumes, ma20, ma50, ma200) {
  const n = closes.length;
  const upVol = [], downVol = [];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i-1]) upVol.push(volumes[i]);
    else downVol.push(volumes[i]);
  }
  const avgUp   = upVol.length   ? upVol.reduce((a, b) => a+b, 0) / upVol.length   : 0;
  const avgDown = downVol.length ? downVol.reduce((a, b) => a+b, 0) / downVol.length : 0;
  const volFavoring = avgUp > avgDown ? 'buyers' : 'sellers';

  const recentRange = Math.max(...closes.slice(-20)) - Math.min(...closes.slice(-20));
  const priorSlice  = closes.slice(-60, -20);
  const isCompressing = priorSlice.length > 0 &&
    recentRange < (Math.max(...priorSlice) - Math.min(...priorSlice)) * 0.5;

  if (price > ma20 && price > ma50 && (!ma200 || price > ma200) && ma20 > ma50)
    return { phase: 'Markup', volFavoring };
  if (price < ma20 && price < ma50 && (!ma200 || price < ma200) && ma20 < ma50)
    return { phase: 'Markdown', volFavoring };
  if (price < ma20 && price < ma50 && isCompressing && volFavoring === 'buyers')
    return { phase: 'Accumulation', volFavoring };
  if (price > ma20 && price < ma50 && isCompressing && volFavoring === 'sellers')
    return { phase: 'Distribution', volFavoring };
  return { phase: 'Unclear', volFavoring };
}

/**
 * @param {Array} candles
 * @param {Object} opts
 * @param {string|null} opts.htfBias
 */
export function analyzeStocks(candles, opts = {}) {
  const { htfBias = null } = opts;

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

  // ── Warnings ─────────────────────────────────────────────
  const warnings = [];

  // ── Extreme / Extended gate ──────────────────────────────
  const rsiExtreme   = lastRsi > 75 || lastRsi < 25;
  const recentMove   = Math.abs(price - closes[Math.max(0, last - 5)]);
  const extendedMove = recentMove > lastAtr * 2;

  if (rsiExtreme || extendedMove) {
    const reason = rsiExtreme
      ? `RSI extreme (${lastRsi.toFixed(1)}) — wait for reset before entry`
      : `Extended move (${fmt(recentMove)} over 5 bars, ATR ${fmt(lastAtr)}) — do not chase`;
    warnings.push(reason);
  }

  // ── Trend + phase ────────────────────────────────────────
  let bias = 'Neutral';
  if (price > ma20 && price > ma50 && ma20 > ma50) bias = 'Bullish';
  else if (price < ma20 && price < ma50 && ma20 < ma50) bias = 'Bearish';

  const { phase, volFavoring } = detectWyckoffPhase(price, closes, volumes, ma20, ma50, ma200);
  const { structure, sh, sl }  = detectTrendStructure(highs, lows, 50, 5);

  const pattern =
    structure === 'uptrend'   ? 'HH/HL — uptrend structure' :
    structure === 'downtrend' ? 'LH/LL — downtrend structure' : 'Consolidation / Base forming';

  // ── Volume signal ────────────────────────────────────────
  const upDaysVol   = [], downDaysVol = [];
  for (let i = Math.max(1, last - 29); i <= last; i++) {
    if (closes[i] >= closes[i-1]) upDaysVol.push(volumes[i]);
    else downDaysVol.push(volumes[i]);
  }
  const avgUpVol   = upDaysVol.length   ? upDaysVol.reduce((a, b) => a+b, 0)   / upDaysVol.length   : 0;
  const avgDownVol = downDaysVol.length ? downDaysVol.reduce((a, b) => a+b, 0) / downDaysVol.length : 0;

  let volumeSignal = 'Neutral';
  if (avgUpVol > avgDownVol * 1.2 && bias === 'Bullish') volumeSignal = 'Confirming';
  else if (avgDownVol > avgUpVol * 1.2 && bias === 'Bearish') volumeSignal = 'Confirming';
  else if (avgUpVol > avgDownVol * 1.2 && bias === 'Bearish') volumeSignal = 'Non-confirming';
  else if (avgDownVol > avgUpVol * 1.2 && bias === 'Bullish') volumeSignal = 'Non-confirming';
  if (volumeSignal === 'Non-confirming') warnings.push('Volume non-confirming — price direction not supported by volume');

  // ── HTF conflict ─────────────────────────────────────────
  const htfConflict = htfBias && htfBias !== 'Neutral' && htfBias !== bias;
  if (htfConflict) warnings.push(`HTF bias (${htfBias}) conflicts with LTF setup — reduced conviction`);

  // ── MA note ──────────────────────────────────────────────
  let maNote = `Price ${price > ma20 ? 'above' : 'below'} MA20 (${fmt(ma20)}), ${price > ma50 ? 'above' : 'below'} MA50 (${fmt(ma50)})`;
  if (ma200) maNote += `, ${price > ma200 ? 'above' : 'below'} MA200 (${fmt(ma200)})`;
  else maNote += ' (MA200 not available — need 200 candles)';

  // ── S/R ──────────────────────────────────────────────────
  const nearestRes = sh.filter(p => p > price).sort((a, b) => a-b)[0] ?? price + lastAtr * 3;
  const nearestSup = sl.filter(p => p < price).sort((a, b) => b-a)[0] ?? price - lastAtr * 3;

  // ── Early exit: Neutral or extreme ──────────────────────
  if (bias === 'Neutral' || rsiExtreme || extendedMove) {
    return out([
      `BIAS: ${bias === 'Neutral' ? 'Neutral' : bias}`,
      `PHASE: ${phase}`,
      `VOLUME SIGNAL: ${volumeSignal}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: N/A — wait`,
      `STOP: N/A`,
      `TARGET 1: N/A`,
      `R:R: No trade — ${bias === 'Neutral' ? 'no clear bias' : 'avoid extremes'}`,
      `CONFIDENCE: Low`,
      warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
      `NOTES: ${maNote}. Volume favoring ${volFavoring}. RSI ${lastRsi.toFixed(1)}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ].filter(Boolean));
  }

  // ── Entry / Stop / Targets (pullback-anchored) ───────────
  let entryLow, entryHigh, entryMid, stopLevel, stopReason, t1, t2, t3;

  if (bias === 'Bullish') {
    // Entry: pullback to MA20 or support — whichever is closer to price
    const pullbackBase = Math.max(nearestSup, ma20 - lastAtr * 0.3);
    entryLow  = pullbackBase;
    entryHigh = pullbackBase + lastAtr * 0.4;
    entryMid  = (entryLow + entryHigh) / 2;
    stopLevel = nearestSup - lastAtr * 0.3;
    stopReason = `below swing support ${fmt(nearestSup)} − 0.3×ATR`;
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
    stopReason = `above swing resistance ${fmt(nearestRes)} + 0.3×ATR`;
    const risk = stopLevel - entryMid;
    t1 = entryMid - risk * 2;
    t2 = nearestSup;
    t3 = nearestSup - (entryMid - nearestSup);
  }

  const entryZone = `${fmt(entryLow)} – ${fmt(entryHigh)} (pullback zone)`;
  const risk  = Math.abs(entryMid - stopLevel);
  const rr1   = Math.abs(t1 - entryMid) / risk;
  const rr2   = Math.abs(t2 - entryMid) / risk;
  const rr3   = Math.abs(t3 - entryMid) / risk;

  if (rr1 < RR_GATE) {
    return out([
      `BIAS: ${bias}`,
      `PHASE: ${phase}`,
      `VOLUME SIGNAL: ${volumeSignal}`,
      `PATTERN: ${pattern}`,
      `ENTRY ZONE: ${entryZone}`,
      `STOP: ${fmt(stopLevel)} (${stopReason})`,
      `TARGET 1: ${fmt(t1)}  (R:R ${rr1.toFixed(2)}:1)`,
      `R:R: No trade — unfavorable R:R (${rr1.toFixed(2)}:1, gate ≥ ${RR_GATE}:1)`,
      `CONFIDENCE: Low`,
      warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
      `NOTES: ${maNote}. Volume ${avgUpVol > avgDownVol ? 'heavier on up days' : 'heavier on down days'}.`,
      ``,
      `Not financial advice. Technical analysis only.`,
    ].filter(Boolean));
  }

  // ── Confidence ───────────────────────────────────────────
  let score = 0;
  if (volumeSignal === 'Confirming') score++;
  if ((phase === 'Markup' && bias === 'Bullish') || (phase === 'Markdown' && bias === 'Bearish')) score++;
  if ((structure === 'uptrend' && bias === 'Bullish') || (structure === 'downtrend' && bias === 'Bearish')) score++;
  if ((bias === 'Bullish' && lastRsi < 70) || (bias === 'Bearish' && lastRsi > 30)) score++;
  let confidence = score >= 3 ? 'High' : score >= 2 ? 'Medium' : 'Low';
  if (htfConflict || volumeSignal === 'Non-confirming') confidence = 'Low';

  return out([
    `BIAS: ${bias}`,
    `PHASE: ${phase}`,
    `VOLUME SIGNAL: ${volumeSignal}`,
    `PATTERN: ${pattern}`,
    `ENTRY ZONE: ${entryZone}`,
    `STOP: ${fmt(stopLevel)} (${stopReason})`,
    `TARGET 1: ${fmt(t1)}  (R:R ${rr1.toFixed(1)}:1)`,
    `TARGET 2: ${fmt(t2)}  (R:R ${rr2.toFixed(1)}:1)`,
    `TARGET 3: ${fmt(t3)}  (R:R ${rr3.toFixed(1)}:1)`,
    `R:R: ${rr1.toFixed(1)}:1 to T1`,
    `CONFIDENCE: ${confidence}`,
    warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
    `NOTES: ${maNote}. Volume ${avgUpVol > avgDownVol ? 'heavier on up days (healthy)' : 'heavier on down days (distribution signal)'}. Phase: ${phase}.`,
    ``,
    `Not financial advice. Technical analysis only.`,
  ].filter(Boolean));
}

function out(arr) { return arr.join('\n'); }
