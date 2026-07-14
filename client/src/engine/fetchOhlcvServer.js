const SERVER_URL = 'http://localhost:3001/api/ohlcv';

/** Forex/Stocks candle auto-fetch via local server proxy (Twelve Data — needs
 *  TWELVEDATA_API_KEY in server/.env). Crypto uses Binance directly and doesn't
 *  need this — see fetchKlines.js. */
export async function fetchOhlcvServer(symbol, interval, market) {
  let response;
  try {
    response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, interval, market }),
    });
  } catch {
    return { error: 'Server not reachable — run `npm run dev` in server/ with TWELVEDATA_API_KEY set (see server/.env.example).' };
  }

  const data = await response.json();
  if (!response.ok) return { error: data.error || `HTTP ${response.status}` };
  return { candles: data.candles };
}
