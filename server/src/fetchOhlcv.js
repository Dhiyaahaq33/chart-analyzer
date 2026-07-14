const BASE = 'https://api.twelvedata.com/time_series';

// Twelve Data's supported intervals — a subset of the app's shared TIMEFRAMES list.
// Unsupported ones (6h, 12h, 3d) return null so the caller can give a clear error
// instead of silently fetching the wrong candle size.
const INTERVAL_MAP = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '2h': '2h', '4h': '4h',
  '1d': '1day', '1w': '1week', '1M': '1month',
};

/** Forex pairs are typed as "EURUSD" in the UI but Twelve Data expects "EUR/USD". */
function normalizeSymbol(symbol, market) {
  const s = symbol.toUpperCase();
  if (market === 'forex' && /^[A-Z]{6}$/.test(s)) {
    return `${s.slice(0, 3)}/${s.slice(3)}`;
  }
  return s;
}

/** @returns {{ candles: Array } | { error: string }} */
export async function fetchOhlcv(symbol, interval, market, apiKey) {
  const tdInterval = INTERVAL_MAP[interval];
  if (!tdInterval) {
    return { error: `Timeframe "${interval}" tidak didukung untuk auto-fetch Forex/Stocks. Pakai: ${Object.keys(INTERVAL_MAP).join(', ')}.` };
  }

  const tdSymbol = normalizeSymbol(symbol, market);
  const url = `${BASE}?symbol=${encodeURIComponent(tdSymbol)}&interval=${tdInterval}&outputsize=500&apikey=${apiKey}`;

  let response;
  try {
    response = await fetch(url);
  } catch (e) {
    return { error: `Twelve Data fetch gagal: ${e.message}` };
  }

  const data = await response.json();
  if (data.status === 'error' || data.code >= 400) {
    return { error: `Twelve Data: ${data.message || `HTTP ${data.code}`}` };
  }
  if (!Array.isArray(data.values) || data.values.length === 0) {
    return { error: `Tidak ada data candle untuk ${tdSymbol} (${tdInterval})` };
  }

  // Twelve Data returns newest-first — reverse to chronological order.
  const candles = data.values
    .map(v => ({
      time:   v.datetime,
      open:   parseFloat(v.open),
      high:   parseFloat(v.high),
      low:    parseFloat(v.low),
      close:  parseFloat(v.close),
      volume: v.volume != null ? parseFloat(v.volume) : 0,
    }))
    .reverse();

  if (candles.length < 30) {
    return { error: `Hanya ${candles.length} candle tersedia untuk ${tdSymbol}/${tdInterval} — butuh minimal 30.` };
  }

  return { candles };
}
