/**
 * Public Binance Futures API helpers — no auth needed, browser-safe.
 * Both endpoints allow cross-origin requests from browsers.
 */

const BASE = 'https://fapi.binance.com/fapi/v1';

/** Classify trend of last 10 values in an array */
function trendOf(arr) {
  if (arr.length < 4) return 'neutral';
  const half = Math.floor(arr.length / 2);
  const early = arr.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const late  = arr.slice(-half).reduce((a, b) => a + b, 0) / half;
  const delta = late - early;
  const pct   = Math.abs(early) > 0 ? delta / Math.abs(early) : 0;
  if (pct > 0.005)  return 'rising';
  if (pct < -0.005) return 'falling';
  return 'neutral';
}

export function formatFR(value) {
  if (value == null || isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(4)}%`;
}

export function formatOI(value) {
  if (value == null || isNaN(value)) return 'N/A';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

export const TREND_ARROW = { rising: '↑', falling: '↓', neutral: '→' };

/**
 * Fetch funding rate history.
 * @returns {{ value, trend, extreme, history } | { error }}
 */
export async function fetchFundingRate(symbol) {
  try {
    const url = `${BASE}/fundingRate?symbol=${encodeURIComponent(symbol.toUpperCase())}&limit=100`;
    const res  = await fetch(url);

    if (res.status === 400) {
      return { error: `Futures data unavailable for ${symbol} (not a perpetual contract)` };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { error: `No funding rate data for ${symbol}` };
    }

    const history = data.map(d => parseFloat(d.fundingRate));
    const value   = history[history.length - 1];
    const trend   = trendOf(history.slice(-10));
    const extreme = Math.abs(value) > 0.0001; // 0.01% threshold

    return { value, trend, extreme, history };
  } catch (e) {
    return { error: `Funding rate fetch failed: ${e.message}` };
  }
}

/**
 * Fetch open interest history (1h periods).
 * @returns {{ value, trend, history } | { error }}
 */
export async function fetchOpenInterest(symbol) {
  try {
    const url = `${BASE}/openInterestHist?symbol=${encodeURIComponent(symbol.toUpperCase())}&period=1h&limit=100`;
    const res  = await fetch(url);

    if (res.status === 400) {
      return { error: `OI data unavailable for ${symbol}` };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { error: `No OI data for ${symbol}` };
    }

    const history = data.map(d => parseFloat(d.sumOpenInterest));
    const value   = history[history.length - 1];
    const trend   = trendOf(history.slice(-10));

    return { value, trend, history };
  } catch (e) {
    return { error: `OI fetch failed: ${e.message}` };
  }
}

/**
 * Fetch both FR and OI in parallel. Returns combined result object.
 * @returns {{ fr, oi }}  where each is either the data or { error }
 */
export async function fetchFuturesData(symbol) {
  const [fr, oi] = await Promise.all([
    fetchFundingRate(symbol),
    fetchOpenInterest(symbol),
  ]);
  return { fr, oi };
}
