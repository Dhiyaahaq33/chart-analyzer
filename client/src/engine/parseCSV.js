/**
 * Parse CSV text into candle array: [{time, open, high, low, close, volume}]
 * Handles TradingView, Yahoo Finance, Binance, and generic OHLCV formats.
 */
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('File terlalu pendek — butuh minimal 2 baris (header + data).');

  // Auto-detect delimiter
  const delimiters = [',', ';', '\t', '|'];
  const header = lines[0];
  const delimiter = delimiters.reduce((best, d) =>
    (header.split(d).length > header.split(best).length ? d : best), ',');

  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Column index detection
  function findCol(...names) {
    for (const name of names) {
      const idx = headers.findIndex(h => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const iOpen   = findCol('open');
  const iHigh   = findCol('high');
  const iLow    = findCol('low');
  const iClose  = findCol('close', 'adjclose', 'last');
  const iVol    = findCol('volume', 'vol');
  const iTime   = findCol('time', 'date', 'datetime', 'timestamp', 'opentime');

  if (iOpen === -1 || iHigh === -1 || iLow === -1 || iClose === -1) {
    throw new Error(
      'Kolom OHLC tidak ditemukan. Pastikan CSV punya kolom: open, high, low, close.\n' +
      `Header yang terdeteksi: ${headers.join(', ')}`
    );
  }

  const candles = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
    const open  = parseFloat(cols[iOpen]);
    const high  = parseFloat(cols[iHigh]);
    const low   = parseFloat(cols[iLow]);
    const close = parseFloat(cols[iClose]);
    const volume = iVol !== -1 ? parseFloat(cols[iVol]) || 0 : 0;
    const time  = iTime !== -1 ? cols[iTime] : `candle-${i}`;

    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
    if (high < low || high < open || high < close) continue; // bad row

    candles.push({ time, open, high, low, close, volume });
  }

  if (candles.length < 30) {
    throw new Error(`Hanya ${candles.length} candle valid ditemukan. Butuh minimal 30 candle.`);
  }

  return candles;
}
