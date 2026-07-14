/**
 * Public Binance Klines (candlestick) API — no auth needed, browser-safe.
 * Crypto only — Forex/Stocks have no equivalent free no-key public API.
 */
const BASE = 'https://api.binance.com/api/v3';

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '3d', '1w', '1M'];

/** @returns {{ candles: Array } | { error: string }} */
export async function fetchKlines(symbol, interval = '1h', limit = 500) {
  try {
    const url = `${BASE}/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);

    if (res.status === 400) {
      return { error: `Symbol ${symbol} tidak ditemukan di Binance` };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { error: `Tidak ada data candle untuk ${symbol}` };
    }

    const candles = data.map(k => ({
      time:   new Date(k[0]).toISOString().slice(0, 16).replace('T', ' '),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    if (candles.length < 30) {
      return { error: `Hanya ${candles.length} candle tersedia untuk ${symbol}/${interval} — butuh minimal 30.` };
    }

    return { candles };
  } catch (e) {
    return { error: `Auto-fetch candle gagal: ${e.message}` };
  }
}
