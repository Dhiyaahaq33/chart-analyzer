import { useState, useEffect } from 'react';
import { formatFR, formatOI, TREND_ARROW } from '../engine/fetchFuturesData.js';
import { getNemotronReasoning } from '../engine/nemotronReasoning.js';

export default function AnalysisResult({ analysis, accent, inputMode, geminiData, frOiData }) {
  const [reasoning, setReasoning]   = useState('');
  const [reasonLoad, setReasonLoad] = useState(false);
  const [reasonErr, setReasonErr]   = useState('');

  // New analysis loaded → old reasoning no longer applies
  useEffect(() => { setReasoning(''); setReasonErr(''); }, [analysis]);

  if (!analysis) return null;

  async function fetchReasoning() {
    setReasonLoad(true); setReasonErr(''); setReasoning('');
    try {
      const text = await getNemotronReasoning(analysis);
      setReasoning(text);
    } catch (e) {
      setReasonErr(e.message);
    } finally {
      setReasonLoad(false);
    }
  }

  const lines    = analysis.split('\n');
  const biasLine = lines.find(l => l.startsWith('BIAS:')) ?? '';
  const isBullish = biasLine.includes('Bullish');
  const isBearish = biasLine.includes('Bearish');
  const isAvoid   = biasLine.includes('Avoid');
  const biasColor = isBullish ? '#22c55e' : isBearish ? '#ef4444' : isAvoid ? '#f59e0b' : 'var(--muted)';
  const biasLabel = isBullish ? '▲ BULLISH' : isBearish ? '▼ BEARISH' : isAvoid ? '⚠ AVOID' : '◆ NEUTRAL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

    {/* Gemini extracted data panel — shown before analysis */}
    {geminiData && <GeminiPanel data={geminiData} frOiData={frOiData} accent={accent} />}

    <div style={{ background: 'var(--surface)', border: `1px solid ${accent}33`, borderRadius: '10px', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: accent, fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {inputMode === 'screenshot' ? '📸 Vision Analysis' : '📊 OHLCV Analysis'}
        </span>
        {biasLine && (
          <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: biasColor, background: `${biasColor}18`, border: `1px solid ${biasColor}44`, borderRadius: '4px', padding: '2px 8px' }}>
            {biasLabel}
          </span>
        )}
      </div>

      {/* Lines */}
      <div style={{ fontFamily: "'Menlo','Consolas',monospace", fontSize: '13px', lineHeight: 1.95 }}>
        {lines.map((line, i) => {
          if (line.trim() === '') return <div key={i} style={{ height: '8px' }} />;

          if (line.startsWith('Not financial')) {
            return <div key={i} style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '4px' }}>{line}</div>;
          }

          if (line.includes('No trade')) {
            return <div key={i} style={{ color: '#f87171', fontWeight: 700 }}>{line}</div>;
          }

          // WARNINGS — highlight amber box
          if (line.startsWith('WARNINGS:')) {
            return (
              <div key={i} style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '6px 10px', marginBottom: '4px' }}>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>WARNINGS</span>
                <span style={{ color: 'var(--muted)' }}>:</span>
                <span style={{ color: '#fcd34d' }}>{line.slice(9)}</span>
              </div>
            );
          }

          // ORDER FLOW — highlight teal box
          if (line.startsWith('ORDER FLOW:')) {
            return (
              <div key={i} style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)', borderRadius: '6px', padding: '6px 10px', marginBottom: '4px' }}>
                <span style={{ color: '#2dd4bf', fontWeight: 700 }}>ORDER FLOW</span>
                <span style={{ color: 'var(--muted)' }}>:</span>
                <span style={{ color: '#99f6e4', fontSize: '12px' }}>{line.slice(11)}</span>
              </div>
            );
          }

          const colonIdx = line.indexOf(':');
          if (colonIdx > 0 && colonIdx < 22) {
            const key = line.slice(0, colonIdx);
            const val = line.slice(colonIdx + 1);
            let valColor = 'var(--text)';
            if (key === 'BIAS')           valColor = biasColor;
            if (key === 'R:R')            valColor = accent;
            if (key === 'TARGET 1')       valColor = '#86efac';
            if (key === 'TARGET 2')       valColor = '#6ee7b7';
            if (key === 'TARGET 3')       valColor = '#5eead4';
            if (key === 'CONFIDENCE')     valColor = val.includes('High') ? '#22c55e' : val.includes('Medium') ? '#f59e0b' : '#ef4444';
            if (key === 'VOLUME SIGNAL')  valColor = val.includes('Confirming') ? '#22c55e' : val.includes('Non-confirming') ? '#ef4444' : 'var(--text)';

            return (
              <div key={i} style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <span style={{ color: accent, fontWeight: 700, minWidth: '120px', flexShrink: 0 }}>{key}</span>
                <span style={{ color: 'var(--muted)' }}>:</span>
                <span style={{ color: valColor }}>{val}</span>
              </div>
            );
          }

          return <div key={i}>{line}</div>;
        })}
      </div>
    </div>

    {/* Nemotron AI reasoning — optional, plain-language explanation only, never changes the numbers above */}
    <NemotronPanel
      accent={accent}
      loading={reasonLoad}
      reasoning={reasoning}
      error={reasonErr}
      onRequest={fetchReasoning}
    />
    </div>
  );
}

// ── Nemotron AI Reasoning Panel ───────────────────────────────────────────────
function NemotronPanel({ accent, loading, reasoning, error, onRequest }) {
  return (
    <div>
      {!reasoning && (
        <button onClick={onRequest} disabled={loading} style={{
          width: '100%', padding: '9px', borderRadius: '8px',
          border: `1px solid ${accent}55`,
          background: 'transparent', color: accent,
          fontWeight: 600, fontSize: '12px', cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '🧠 Thinking…' : '🧠 AI Reasoning (Nemotron 30B)'}
        </button>
      )}
      {reasoning && (
        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            🧠 Nemotron 30B — Reasoning
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{reasoning}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
            Commentary only — does not change BIAS/ENTRY/STOP/TARGET computed above.
          </div>
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '6px', padding: '8px 10px', color: '#fcd34d', fontSize: '12px', marginTop: '6px' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Gemini Extracted Data Panel ───────────────────────────────────────────────
function GeminiPanel({ data, frOiData, accent }) {
  const rows = [
    { label: 'Price',       value: data.price != null ? data.price.toLocaleString() : null, color: 'var(--text)' },
    { label: 'RSI',         value: data.rsi != null ? data.rsi.toFixed(1) : null,           color: data.rsi > 70 ? '#f59e0b' : data.rsi < 30 ? '#3b82f6' : '#99f6e4' },
    { label: 'Trend',       value: data.trend_visual,                                        color: data.trend_visual === 'bullish' ? '#22c55e' : data.trend_visual === 'bearish' ? '#ef4444' : '#f59e0b' },
    { label: 'Volume',      value: data.volume_note,                                         color: data.volume_note === 'expanding' ? '#22c55e' : '#f59e0b' },
    { label: 'Spot CVD',    value: data.cvd_spot != null ? (data.cvd_spot > 0 ? `+${data.cvd_spot.toLocaleString()}` : data.cvd_spot.toLocaleString()) : null, color: data.cvd_spot > 0 ? '#22c55e' : '#ef4444' },
    { label: 'Futures CVD', value: data.cvd_futures != null ? (data.cvd_futures > 0 ? `+${data.cvd_futures.toLocaleString()}` : data.cvd_futures.toLocaleString()) : null, color: data.cvd_futures > 0 ? '#22c55e' : '#ef4444' },
    { label: 'OI (chart)',  value: data.open_interest != null ? formatOI(data.open_interest) : null, color: '#99f6e4' },
    { label: 'FR (chart)',  value: data.funding_rate != null ? formatFR(data.funding_rate) : null,   color: Math.abs(data.funding_rate ?? 0) > 0.0001 ? '#f59e0b' : '#99f6e4' },
  ].filter(r => r.value != null);

  // Binance fetched values (more accurate)
  const binanceRows = [];
  if (frOiData?.fr?.value != null) {
    const fr = frOiData.fr;
    binanceRows.push({ label: 'FR (live)', value: `${formatFR(fr.value)} ${TREND_ARROW[fr.trend] ?? '→'}${fr.extreme ? ' ⚠' : ''}`, color: fr.extreme ? '#f59e0b' : '#22c55e' });
  }
  if (frOiData?.oi?.value != null) {
    const oi = frOiData.oi;
    binanceRows.push({ label: 'OI (live)', value: `${formatOI(oi.value)} ${TREND_ARROW[oi.trend] ?? '→'}`, color: oi.trend === 'rising' ? '#22c55e' : oi.trend === 'falling' ? '#ef4444' : 'var(--text)' });
  }

  return (
    <div style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.3)', borderRadius: '10px', padding: '16px 20px' }}>
      <div style={{ fontSize: '11px', color: '#2dd4bf', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
        🔍 Vision Model — Extracted Values
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px 16px' }}>
        {[...rows, ...binanceRows].map(({ label, value, color }) => (
          <div key={label} style={{ fontFamily: 'monospace', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--muted)', minWidth: '80px', flexShrink: 0 }}>{label}:</span>
            <span style={{ color, fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--muted)' }}>
        Values extracted from screenshot by Llama 3.2 90B Vision · Live FR/OI from Binance
      </div>
    </div>
  );
}
