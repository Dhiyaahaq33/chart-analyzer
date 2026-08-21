import { useRef, useState } from 'react';
import { formatFR, formatOI, TREND_ARROW } from '../engine/fetchFuturesData.js';
import { getVisionExtract } from '../engine/visionExtract.js';
import { TIMEFRAMES } from '../engine/fetchKlines.js';

const STYLES      = [
  { value: 'scalp',    label: 'Scalp (< 1H)' },
  { value: 'swing',    label: 'Swing (hours–days)' },
  { value: 'position', label: 'Position (days–weeks)' },
];
const HTF_OPTIONS = ['— none —', 'Bullish', 'Bearish', 'Neutral'];

/**
 * Props:
 *   onSubmit({ file, symbol, timeframe, tradeStyle, htfBias, geminiExtract })
 *   accent, loading
 *   market
 *   symbol, onSymbolChange
 *   timeframe, onTimeframeChange  — shared with OHLCV auto-fetch interval
 *   frOiData    — { fr, oi, loading } (crypto only)
 *   klineStatus — { loading, error, source, count } — OHLCV auto-fetch status (all markets)
 */
export default function ScreenshotInput({
  onSubmit, accent, loading,
  market,
  symbol = '', onSymbolChange,
  timeframe = '1h', onTimeframeChange,
  frOiData, klineStatus,
}) {
  const fileRef = useRef();
  const [dragging, setDragging]       = useState(false);
  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState(null);
  const [tradeStyle, setStyle]        = useState('swing');
  const [htfBias, setHtfBias]         = useState('— none —');
  const [geminiLoading, setGLoading]  = useState(false);
  const [geminiExtract, setGExtract]  = useState(null);
  const [geminiError, setGError]      = useState('');

  function pickFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setGExtract(null); setGError('');
  }

  function clear() {
    setFile(null); setPreview(null);
    setGExtract(null); setGError('');
  }

  async function extractWithNemotronVL(imageFile) {
    setGLoading(true); setGError('');
    try {
      const extracted = await getVisionExtract(imageFile, market);
      setGExtract(extracted);
      return extracted;
    } catch (e) {
      setGError(e.message);
      return null;
    } finally {
      setGLoading(false);
    }
  }

  async function handleSubmit() {
    if (!file) return;
    const extracted = await extractWithNemotronVL(file);
    onSubmit({
      file,
      symbol: symbol.trim() || 'Unknown',
      timeframe,
      tradeStyle,
      htfBias: htfBias === '— none —' ? null : htfBias,
      geminiExtract: extracted,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Image drop zone or preview */}
      {!preview ? (
        <div
          onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? accent : 'var(--border)'}`,
            borderRadius: '10px', padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? `${accent}08` : 'transparent', transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📸</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Drop chart screenshot here</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Coinglass, TradingView, MT4/5 — PNG, JPG, WEBP</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => pickFile(e.target.files[0])} />
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <img src={preview} alt="chart preview"
            style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }} />
          <button onClick={clear} style={{
            position: 'absolute', top: '8px', right: '8px',
            background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border)',
            borderRadius: '5px', color: 'var(--text)', padding: '3px 9px', fontSize: '11px', cursor: 'pointer',
          }}>✕ Remove</button>
        </div>
      )}

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* Symbol */}
        <div style={{ gridColumn: market === 'crypto' ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
            SYMBOL{market === 'crypto' ? ' (auto-fetches FR + OI)' : ''}
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={symbol}
              onChange={e => onSymbolChange?.(e.target.value.toUpperCase())}
              placeholder={market === 'crypto' ? 'BTCUSDT / ETHUSDT' : 'EURUSD / AAPL'}
              style={{
                flex: 1, background: 'var(--surface)', border: `1px solid ${symbol ? accent + '66' : 'var(--border)'}`,
                borderRadius: '6px', padding: '7px 10px', color: 'var(--text)', fontSize: '13px', outline: 'none',
              }}
            />
            {frOiData?.loading && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>⏳</span>}
          </div>
          {/* FR/OI chips — crypto only */}
          {frOiData && !frOiData.loading && market === 'crypto' && (
            <FrOiChips fr={frOiData.fr} oi={frOiData.oi} accent={accent} />
          )}
          {/* OHLCV auto-fetch status — all markets */}
          {klineStatus && !klineStatus.loading && klineStatus.source && (
            <div style={{ fontSize: '11px', color: '#22c55e' }}>
              ✓ {klineStatus.count} candle ({klineStatus.source === 'binance' ? 'Binance' : 'Twelve Data'})
            </div>
          )}
          {klineStatus?.error && (
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{klineStatus.error}</div>
          )}
        </div>

        {/* Timeframe */}
        <Field label="TIMEFRAME">
          <select value={timeframe} onChange={e => onTimeframeChange?.(e.target.value)} style={selectStyle}>
            {TIMEFRAMES.map(tf => <option key={tf}>{tf}</option>)}
          </select>
        </Field>

        {/* Trade style */}
        <Field label="TRADE STYLE">
          <select value={tradeStyle} onChange={e => setStyle(e.target.value)} style={selectStyle}>
            {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>

        {/* HTF bias */}
        <Field label="HTF BIAS (optional)">
          <select value={htfBias} onChange={e => setHtfBias(e.target.value)} style={selectStyle}>
            {HTF_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>

      {/* Vision loading / extracted preview */}
      {geminiLoading && (
        <div style={{ fontSize: '12px', color: accent, textAlign: 'center', padding: '8px' }}>
          🔍 Reading chart with vision AI…
        </div>
      )}
      {geminiExtract && !geminiLoading && (
        <GeminiPreview data={geminiExtract} accent={accent} />
      )}
      {geminiError && !geminiLoading && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '6px', padding: '8px 10px', color: '#fcd34d', fontSize: '12px' }}>
          {geminiError}
        </div>
      )}

      {/* Submit */}
      <button onClick={handleSubmit} disabled={!file || loading || geminiLoading} style={{
        padding: '13px', borderRadius: '8px', border: 'none',
        background: file && !loading && !geminiLoading ? accent : 'var(--border)',
        color: file && !loading && !geminiLoading ? '#000' : 'var(--muted)',
        fontWeight: 700, fontSize: '15px',
        opacity: !file || loading || geminiLoading ? 0.55 : 1, transition: 'all 0.15s', cursor: 'pointer',
      }}>
        {geminiLoading ? '🔍 Reading chart…' : loading ? 'Analyzing…' : '🔍 Extract + Analyze'}
      </button>

      <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
        Llama 3.2 90B Vision reads chart values from screenshot (crypto: CVD/OI/Funding too)
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const selectStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
  padding: '7px 10px', color: 'var(--text)', fontSize: '13px', outline: 'none', cursor: 'pointer',
};

function FrOiChips({ fr, oi, accent }) {
  const parts = [];
  if (fr?.value != null) {
    const arrow = TREND_ARROW[fr.trend] ?? '→';
    const color = fr.extreme ? '#f59e0b' : '#22c55e';
    parts.push({ text: `FR: ${formatFR(fr.value)} ${arrow}${fr.extreme ? ' ⚠' : ''}`, color });
  } else if (fr?.error) {
    parts.push({ text: fr.error, color: 'var(--muted)' });
  }
  if (oi?.value != null) {
    const arrow = TREND_ARROW[oi.trend] ?? '→';
    const color = oi.trend === 'rising' ? '#22c55e' : oi.trend === 'falling' ? '#ef4444' : 'var(--text)';
    parts.push({ text: `OI: ${formatOI(oi.value)} ${arrow}`, color });
  }
  if (!parts.length) return null;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span key={i} style={{ fontSize: '12px', fontWeight: 600, color: p.color, background: `${p.color}12`, border: `1px solid ${p.color}30`, borderRadius: '4px', padding: '2px 8px', fontFamily: 'monospace' }}>
          {p.text}
        </span>
      ))}
    </div>
  );
}

function GeminiPreview({ data, accent }) {
  const rows = [
    ['Price',       data.price != null ? data.price.toLocaleString() : null],
    ['Spot CVD',    data.cvd_spot != null ? (data.cvd_spot > 0 ? `+${data.cvd_spot.toLocaleString()}` : data.cvd_spot.toLocaleString()) : null],
    ['Futures CVD', data.cvd_futures != null ? (data.cvd_futures > 0 ? `+${data.cvd_futures.toLocaleString()}` : data.cvd_futures.toLocaleString()) : null],
    ['OI',          data.open_interest != null ? formatOI(data.open_interest) : null],
    ['Funding',     data.funding_rate != null ? formatFR(data.funding_rate) : null],
    ['RSI',         data.rsi != null ? data.rsi.toFixed(1) : null],
    ['Volume',      data.volume_note],
    ['Trend',       data.trend_visual],
  ].filter(([, v]) => v != null);

  return (
    <div style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: '8px', padding: '12px' }}>
      <div style={{ fontSize: '11px', color: '#2dd4bf', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px', textTransform: 'uppercase' }}>
        🔍 Vision Model Extracted Data
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ fontSize: '12px', fontFamily: 'monospace', display: 'flex', gap: '6px' }}>
            <span style={{ color: 'var(--muted)', minWidth: '70px' }}>{label}:</span>
            <span style={{ color: '#99f6e4', fontWeight: 600 }}>{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
