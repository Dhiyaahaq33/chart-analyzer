import { useRef, useState } from 'react';
import { formatFR, formatOI, TREND_ARROW } from '../engine/fetchFuturesData.js';
import { TIMEFRAMES } from '../engine/fetchKlines.js';

const EXAMPLE = `time,open,high,low,close,volume
2024-01-01,42000,43100,41800,42500,1234
2024-01-02,42500,44000,42200,43800,1890
2024-01-03,43800,44500,43000,43200,1120`;

/**
 * Props:
 *   onData(csvText)               — called when CSV is ready to parse
 *   accent                        — accent color string
 *   market                        — 'crypto'|'forex'|'stocks' (symbol shown for crypto only)
 *   symbol                        — controlled value
 *   onSymbolChange(sym)           — called on input change
 *   frOiData                      — { fr:{value,trend,extreme,error}, oi:{value,trend,error}, loading }
 *   timeframe, onTimeframeChange  — crypto only, drives Binance auto-fetch interval
 *   klineStatus                   — { loading, error, source: 'binance'|null } — auto-fetch status
 */
export default function DataInput({
  onData, accent, market, symbol = '', onSymbolChange, frOiData,
  timeframe = '1h', onTimeframeChange, klineStatus,
}) {
  const fileRef = useRef();
  const [dragging, setDragging]   = useState(false);
  const [mode, setMode]           = useState('upload'); // 'upload' | 'paste'
  const [pasteText, setPasteText] = useState('');
  const [error, setError]         = useState('');

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => submit(e.target.result);
    reader.readAsText(file);
  }

  function submit(text) {
    setError('');
    try { onData(text); } catch (e) { setError(e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Symbol field — all markets, auto-fetches candle (+ FR/OI for crypto) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', color: accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          SYMBOL (optional — auto-fetches candle{market === 'crypto' ? ' + FR + OI dari Binance' : ' via Twelve Data'})
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            value={symbol}
            onChange={e => onSymbolChange?.(e.target.value.toUpperCase())}
            placeholder={market === 'crypto' ? 'BTCUSDT, ETHUSDT...' : market === 'forex' ? 'EURUSD, XAUUSD...' : 'AAPL, TSLA...'}
            style={{
              flex: 1,
              background: 'var(--surface)', border: `1px solid ${symbol ? accent + '66' : 'var(--border)'}`,
              borderRadius: '6px', padding: '7px 10px',
              color: 'var(--text)', fontSize: '13px', outline: 'none', textTransform: 'uppercase',
            }}
          />
          <select
            value={timeframe}
            onChange={e => onTimeframeChange?.(e.target.value)}
            title="Timeframe candle auto-fetch"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '7px 8px', color: 'var(--text)', fontSize: '13px', outline: 'none', cursor: 'pointer',
            }}
          >
            {TIMEFRAMES.map(tf => <option key={tf}>{tf}</option>)}
          </select>
          {(frOiData?.loading || klineStatus?.loading) && (
            <span style={{ fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>⏳ fetching…</span>
          )}
        </div>

        {/* Klines auto-fetch status */}
        {klineStatus && !klineStatus.loading && klineStatus.source && (
          <div style={{ fontSize: '11px', color: '#22c55e' }}>
            ✓ {klineStatus.count} candle auto-fetched dari {klineStatus.source === 'binance' ? 'Binance' : 'Twelve Data'} ({timeframe})
          </div>
        )}
        {klineStatus?.error && (
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {klineStatus.error} — upload/paste CSV manual di bawah
          </div>
        )}

        {/* FR/OI summary — crypto only */}
        {market === 'crypto' && frOiData && !frOiData.loading && (
          <FrOiSummary fr={frOiData.fr} oi={frOiData.oi} accent={accent} />
        )}
      </div>

      {/* Upload/paste toggle */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {['upload', 'paste'].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
            padding: '6px 16px', borderRadius: '6px',
            border: `1px solid ${mode === m ? accent : 'var(--border)'}`,
            background: mode === m ? `${accent}18` : 'transparent',
            color: mode === m ? accent : 'var(--muted)',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            {m === 'upload' ? '📁 Upload CSV' : '📋 Paste Data'}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <div
          onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? accent : 'var(--border)'}`,
            borderRadius: '10px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? `${accent}08` : 'transparent', transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Drop file CSV di sini</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>atau klik untuk browse</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder={`Paste data OHLCV di sini...\n\nContoh format:\n${EXAMPLE}`}
            rows={10}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '12px', color: 'var(--text)', fontFamily: 'monospace',
              fontSize: '12px', resize: 'vertical', outline: 'none',
            }}
          />
          <button onClick={() => submit(pasteText)} disabled={!pasteText.trim()} style={{
            padding: '10px', borderRadius: '8px', border: 'none',
            background: pasteText.trim() ? accent : 'var(--border)',
            color: pasteText.trim() ? '#000' : 'var(--muted)',
            fontWeight: 700, fontSize: '14px', cursor: pasteText.trim() ? 'pointer' : 'default',
          }}>
            Parse Data
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px', color: '#f87171', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}

      <details style={{ fontSize: '12px', color: 'var(--muted)' }}>
        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>💡 Format CSV yang didukung</summary>
        <div style={{ marginTop: '8px', background: 'var(--surface)', borderRadius: '8px', padding: '12px', lineHeight: 1.8 }}>
          <b style={{ color: 'var(--text)' }}>Header wajib:</b> open, high, low, close
          <br /><b style={{ color: 'var(--text)' }}>Header opsional:</b> time/date, volume
          <br /><br />
          <b style={{ color: 'var(--text)' }}>Sumber data gratis:</b>
          <ul style={{ paddingLeft: '16px', marginTop: '4px' }}>
            <li>TradingView → klik kanan chart → "Export chart data"</li>
            <li>Yahoo Finance → tombol Download di halaman saham</li>
            <li>Binance → Riwayat Kline via API atau export</li>
          </ul>
          <br /><b style={{ color: 'var(--text)' }}>Minimal:</b> 30 candle (disarankan 100+)
        </div>
      </details>
    </div>
  );
}

// ── FR/OI summary chip ────────────────────────────────────────────────────────
function FrOiSummary({ fr, oi, accent }) {
  const parts = [];

  if (fr?.error) {
    parts.push({ text: `FR: ${fr.error}`, color: 'var(--muted)' });
  } else if (fr?.value != null) {
    const arrow = TREND_ARROW[fr.trend] ?? '→';
    const color = fr.extreme ? '#f59e0b' : '#22c55e';
    parts.push({ text: `FR: ${formatFR(fr.value)} ${arrow}${fr.extreme ? ' ⚠ extreme' : ''}`, color });
  }

  if (oi?.error) {
    parts.push({ text: `OI: ${oi.error}`, color: 'var(--muted)' });
  } else if (oi?.value != null) {
    const arrow = TREND_ARROW[oi.trend] ?? '→';
    const color = oi.trend === 'rising' ? '#22c55e' : oi.trend === 'falling' ? '#ef4444' : 'var(--text)';
    parts.push({ text: `OI: ${formatOI(oi.value)} ${arrow}`, color });
  }

  if (!parts.length) return null;

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span key={i} style={{
          fontSize: '12px', fontWeight: 600, color: p.color,
          background: `${p.color}10`, border: `1px solid ${p.color}30`,
          borderRadius: '4px', padding: '2px 8px',
          fontFamily: 'monospace',
        }}>
          {p.text}
        </span>
      ))}
    </div>
  );
}
