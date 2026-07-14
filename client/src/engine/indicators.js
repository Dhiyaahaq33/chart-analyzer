// Pure math — no external dependencies

export function sma(values, period) {
  const result = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

export function ema(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  // Seed with SMA of first `period` values
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [prev];
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return [];
  const result = [];
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    }
    // Fix: flat series (both zero) → NaN guard, return neutral 50
    if (avgGain === 0 && avgLoss === 0) { result.push(50); continue; }
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function atr(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  return sma(trs, period);
}

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  // Guard: insufficient data
  if (closes.length < slow + signal) return { macdLine: [], signalLine: [], histogram: [] };
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const offset = slow - fast; // fastEma is longer by this amount
  const macdLine = fastEma.slice(offset).map((v, i) => v - slowEma[i]);
  if (macdLine.length < signal) return { macdLine, signalLine: [], histogram: [] };
  const signalLine = ema(macdLine, signal);
  const macdAligned = macdLine.slice(macdLine.length - signalLine.length);
  const histogram = macdAligned.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export function swingHighs(highs, lookback = 5) {
  const result = [];
  for (let i = lookback; i < highs.length - lookback; i++) {
    let isHigh = true;
    for (let j = i - lookback; j < i; j++) if (highs[j] >= highs[i]) { isHigh = false; break; }
    if (isHigh) for (let j = i + 1; j <= i + lookback; j++) if (highs[j] >= highs[i]) { isHigh = false; break; }
    if (isHigh) result.push(highs[i]);
  }
  return result;
}

export function swingLows(lows, lookback = 5) {
  const result = [];
  for (let i = lookback; i < lows.length - lookback; i++) {
    let isLow = true;
    for (let j = i - lookback; j < i; j++) if (lows[j] <= lows[i]) { isLow = false; break; }
    if (isLow) for (let j = i + 1; j <= i + lookback; j++) if (lows[j] <= lows[i]) { isLow = false; break; }
    if (isLow) result.push(lows[i]);
  }
  return result;
}

// Swing-based trend structure detector (replaces crude endpoint comparison)
// Returns { structure: 'uptrend'|'downtrend'|'ranging', sh, sl }
export function detectTrendStructure(highs, lows, lookback = 50, swingLb = 4) {
  const sh = swingHighs(highs.slice(-lookback), swingLb);
  const sl = swingLows(lows.slice(-lookback), swingLb);

  let score = 0, total = 0;
  for (let i = 1; i < sh.length; i++) { score += sh[i] > sh[i-1] ? 1 : -1; total++; }
  for (let i = 1; i < sl.length; i++) { score += sl[i] > sl[i-1] ? 1 : -1; total++; }

  if (total < 2) return { structure: 'ranging', sh, sl };
  const ratio = score / total;
  const structure = ratio >= 0.5 ? 'uptrend' : ratio <= -0.5 ? 'downtrend' : 'ranging';
  return { structure, sh, sl };
}

/**
 * CVD approximation from OHLCV candles.
 * Uses the (close − low) vs (high − close) ratio of each candle's range
 * to estimate whether buyers or sellers dominated, weighted by volume.
 * Returns an array of cumulative delta values (same length as candles).
 */
export function cvdApprox(candles) {
  let cum = 0;
  return candles.map(c => {
    const range = c.high - c.low;
    const delta = range > 0
      ? ((c.close - c.low) - (c.high - c.close)) / range * c.volume
      : 0;
    cum += delta;
    return cum;
  });
}

/**
 * Classify CVD trend from the cvdApprox array.
 * Returns 'bullish' | 'bearish' | 'neutral'
 */
export function cvdTrend(cvdArr, lookback = 20) {
  if (cvdArr.length < 4) return 'neutral';
  const recent = cvdArr.slice(-lookback);
  const start  = recent[0];
  const end    = recent[recent.length - 1];
  const range  = Math.max(...recent) - Math.min(...recent);
  if (range === 0) return 'neutral';
  const pct = (end - start) / range;
  if (pct > 0.2)  return 'bullish';
  if (pct < -0.2) return 'bearish';
  return 'neutral';
}

// Smart price formatter
export function fmt(price) {
  if (price === undefined || price === null || isNaN(price)) return 'N/A';
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toPrecision(4);
}
