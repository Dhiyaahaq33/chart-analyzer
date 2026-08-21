import { useState, useEffect, useRef } from 'react';
import TabBar, { TABS } from './components/TabBar.jsx';
import DataInput from './components/DataInput.jsx';
import ScreenshotInput from './components/ScreenshotInput.jsx';
import AnalysisResult from './components/AnalysisResult.jsx';
import { parseCSV } from './engine/parseCSV.js';
import { analyzeCrypto } from './engine/crypto.js';
import { analyzeForex }  from './engine/forex.js';
import { analyzeStocks } from './engine/stocks.js';
import { cvdApprox, cvdTrend } from './engine/indicators.js';
import { fetchFuturesData } from './engine/fetchFuturesData.js';
import { fetchKlines } from './engine/fetchKlines.js';
import { fetchOhlcvServer } from './engine/fetchOhlcvServer.js';

const ENGINES = { forex: analyzeForex, stocks: analyzeStocks };

export default function App() {
  const [market, setMarket]     = useState('crypto');
  const [inputMode, setMode]    = useState('csv');      // 'csv' | 'screenshot'

  // ── CSV state ─────────────────────────────────────────────
  const [candles, setCandles]   = useState(null);
  const [csvInfo, setCsvInfo]   = useState(null);
  const [parseError, setPErr]   = useState('');
  const candlesSourceRef        = useRef(null);   // 'manual' | 'binance' | null — guards auto-fetch overwrite
  const [candlesSource, setCandlesSrc] = useState(null);
  function setSource(v) { candlesSourceRef.current = v; setCandlesSrc(v); }

  // ── Symbol + FR/OI state ──────────────────────────────────
  const [symbol, setSymbol]     = useState('');
  const [frOiData, setFrOi]     = useState(null); // { fr, oi, loading }
  const fetchTimer              = useRef(null);   // debounce timer

  // ── CSV timeframe + Binance klines auto-fetch state (crypto only) ──
  const [csvTimeframe, setCsvTf] = useState('1h');
  const [klineStatus, setKlineStatus] = useState(null); // { loading, error, source, count }
  const klineTimer                = useRef(null);

  // ── Analysis output ───────────────────────────────────────
  const [analysis, setAnalysis] = useState(null);
  const [geminiData, setGData]  = useState(null); // extracted by Gemini Vision
  const [serverError, setSErr]  = useState('');
  const [loading, setLoading]   = useState(false);

  const accent = TABS.find(t => t.id === market)?.accent ?? 'var(--amber)';

  // ── Symbol change → debounced FR+OI fetch (crypto only) ──
  useEffect(() => {
    if (market !== 'crypto' || !symbol || symbol.length < 3) {
      setFrOi(null);
      return;
    }
    clearTimeout(fetchTimer.current);
    setFrOi({ loading: true, fr: null, oi: null });
    fetchTimer.current = setTimeout(async () => {
      const { fr, oi } = await fetchFuturesData(symbol);
      setFrOi({ loading: false, fr, oi });
    }, 600); // 600ms debounce
  }, [symbol, market]);

  // ── Symbol/timeframe change → debounced OHLCV auto-fetch (all markets, both modes) ──
  // Crypto → Binance directly, no server needed. Forex/Stocks → local server proxy to
  // Twelve Data (needs TWELVEDATA_API_KEY in server/.env — CORS-blocked otherwise).
  // Runs in Screenshot mode too — so screenshot analysis auto-enriches with precise
  // ENTRY/STOP/TARGET instead of falling back to generic placeholders. Skipped once
  // a manual CSV is loaded — "Ganti" resets and re-enables this.
  useEffect(() => {
    if (!symbol || symbol.length < 3) return;
    if (candlesSourceRef.current === 'manual') return;

    clearTimeout(klineTimer.current);
    setKlineStatus({ loading: true, error: '', source: null, count: 0 });
    klineTimer.current = setTimeout(async () => {
      const result = market === 'crypto'
        ? await fetchKlines(symbol, csvTimeframe)
        : await fetchOhlcvServer(symbol, csvTimeframe, market);

      if (result.error) {
        setKlineStatus({ loading: false, error: result.error, source: null, count: 0 });
        return;
      }
      const source = market === 'crypto' ? 'binance' : 'twelvedata';
      setCandles(result.candles);
      setSource(source);
      setCsvInfo({
        count:     result.candles.length,
        from:      result.candles[0].time,
        to:        result.candles[result.candles.length - 1].time,
        lastClose: result.candles[result.candles.length - 1].close,
      });
      setKlineStatus({ loading: false, error: '', source, count: result.candles.length });
    }, 600);
  }, [symbol, market, csvTimeframe]);

  // ── Tab / mode change ─────────────────────────────────────
  // Switching CSV↔Screenshot keeps candles/symbol (both can now share auto-fetched OHLCV).
  // Switching market is a full reset — different symbol universe entirely.
  function switchMarket(m) { setMarket(m); resetAll(); }
  function switchMode(m)   { setMode(m); setAnalysis(null); setPErr(''); setSErr(''); setGData(null); }

  function resetAll() {
    setCandles(null); setCsvInfo(null); setSource(null); setKlineStatus(null);
    setAnalysis(null); setPErr(''); setSErr(''); setGData(null);
  }

  // ── CSV path ──────────────────────────────────────────────
  function handleCSVData(csvText) {
    setPErr(''); setAnalysis(null); setGData(null);
    let parsed;
    try { parsed = parseCSV(csvText); }
    catch (e) { setPErr(e.message); setCandles(null); setCsvInfo(null); return; }
    setCandles(parsed);
    setSource('manual');
    setCsvInfo({
      count:     parsed.length,
      from:      parsed[0].time,
      to:        parsed[parsed.length - 1].time,
      lastClose: parsed[parsed.length - 1].close,
    });
  }

  function runCSVAnalysis() {
    if (!candles) return;
    try {
      if (market === 'crypto') {
        // Compute CVD approximation from candles
        const cvdArr   = cvdApprox(candles);
        const cvdBias  = cvdTrend(cvdArr, 20);

        const opts = {
          fundingRate:  frOiData?.fr?.error  ? null : frOiData?.fr  ?? null,
          openInterest: frOiData?.oi?.error  ? null : frOiData?.oi  ?? null,
          cvdTrend:     cvdBias,
        };
        setAnalysis(analyzeCrypto(candles, opts));
      } else {
        setAnalysis(ENGINES[market](candles));
      }
    } catch (e) {
      setAnalysis(`BIAS: Error\nNOTES: ${e.message}`);
    }
  }

  // ── Screenshot path (Gemini Vision + local engine) ───────
  async function runScreenshotAnalysis({ file, symbol: sym, timeframe, tradeStyle, htfBias, geminiExtract }) {
    setSErr(''); setAnalysis(null); setLoading(true);
    setGData(geminiExtract ?? null);

    try {
      if (market === 'crypto') {
        // Build opts from Gemini extract + Binance FR/OI
        const opts = {
          htfBias,
          fundingRate:  frOiData?.fr?.error  ? null : frOiData?.fr  ?? null,
          openInterest: frOiData?.oi?.error  ? null : frOiData?.oi  ?? null,
          cvdTrend:     geminiExtract?.cvd_spot != null
                          ? (geminiExtract.cvd_spot > 0 ? 'bullish' : 'bearish')
                          : null,
          geminiExtract: geminiExtract ?? null,
        };

        if (candles) {
          // If user also loaded CSV, use full OHLCV analysis enriched with order-flow
          setAnalysis(analyzeCrypto(candles, opts));
        } else {
          // Screenshot only — build analysis from extracted values
          setAnalysis(analyzeFromExtract(market, geminiExtract, opts, sym, timeframe, tradeStyle));
        }
      } else {
        // Forex / stocks — use OHLCV if available, else show extracted values only
        if (candles) {
          setAnalysis(ENGINES[market](candles, { htfBias }));
        } else {
          setAnalysis(analyzeFromExtract(market, geminiExtract, { htfBias }, sym, timeframe, tradeStyle));
        }
      }
    } catch (e) {
      setSErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const hasResult = Boolean(analysis);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Chart Analyzer</h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
          Screenshot → Llama 3.2 90B Vision (server) · CSV → Rule-based engine · FR/OI auto-fetch
        </p>
      </div>

      {/* Landscape split once there's a result: input left, analysis right. Wraps to
          stacked (portrait) on narrow viewports via flex-wrap — no separate mobile layout needed. */}
      <div style={{
        width: '100%', maxWidth: hasResult ? '1400px' : '720px',
        display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center', alignItems: 'flex-start',
      }}>
        {/* Left column — controls */}
        <div style={{
          flex: hasResult ? '1 1 440px' : '1 1 100%', maxWidth: hasResult ? '520px' : '720px',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          <TabBar active={market} onChange={switchMarket} />

          <div style={{ fontSize: '12px', color: accent, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {market === 'crypto' && '⚡ Crypto — Vision model reads CVD/OI/FR · Binance auto-fetch · OHLCV engine'}
            {market === 'forex'  && '🌐 Forex — HTF Bias · Session · Institutional levels'}
            {market === 'stocks' && '📈 Stocks — Volume · Wyckoff · MA alignment'}
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', gap: '4px' }}>
            {[
              { id: 'screenshot', label: '📸 Screenshot + Vision AI', desc: 'Vision extraction via server' },
              { id: 'csv',        label: '📊 CSV Data (Offline)',       desc: 'Browser engine, no server needed' },
            ].map(m => (
              <button key={m.id} onClick={() => switchMode(m.id)} style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: '5px',
                background: inputMode === m.id ? `${accent}20` : 'transparent',
                color: inputMode === m.id ? accent : 'var(--muted)',
                fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                outline: inputMode === m.id ? `1px solid ${accent}44` : 'none',
              }}>
                <div>{m.label}</div>
                <div style={{ fontSize: '10px', opacity: 0.7, fontWeight: 400 }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Input area */}
          {inputMode === 'screenshot' ? (
            <ScreenshotInput
              onSubmit={runScreenshotAnalysis}
              accent={accent}
              loading={loading}
              market={market}
              symbol={symbol}
              onSymbolChange={setSymbol}
              timeframe={csvTimeframe}
              onTimeframeChange={setCsvTf}
              frOiData={frOiData}
              klineStatus={klineStatus}
            />
          ) : (
            <>
              {!csvInfo ? (
                <>
                  <DataInput
                    onData={handleCSVData}
                    accent={accent}
                    market={market}
                    symbol={symbol}
                    onSymbolChange={setSymbol}
                    frOiData={frOiData}
                    timeframe={csvTimeframe}
                    onTimeframeChange={setCsvTf}
                    klineStatus={klineStatus}
                  />
                  {parseError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#f87171', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                      {parseError}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background: 'var(--surface)', border: `1px solid ${accent}44`, borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px', color: accent }}>
                      ✅ {csvInfo.count} candle dimuat
                      {symbol && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {symbol}</span>}
                      {candlesSource === 'binance' && (
                        <span style={{ color: '#22c55e', fontWeight: 400 }}> · 🌐 auto-fetch Binance ({csvTimeframe})</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {csvInfo.from} → {csvInfo.to} · Close: <b style={{ color: 'var(--text)' }}>{csvInfo.lastClose}</b>
                    </div>
                    {/* FR/OI inline summary when candles loaded */}
                    {frOiData && !frOiData.loading && (
                      <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[frOiData.fr, frOiData.oi].filter(Boolean).map((d, i) => {
                          if (d.error) return null;
                          const isOi = 'value' in d && 'trend' in d && !('extreme' in d);
                          const val  = isOi
                            ? `OI: ${formatOIShort(d.value)} ${d.trend === 'rising' ? '↑' : d.trend === 'falling' ? '↓' : '→'}`
                            : `FR: ${formatFRShort(d.value)}${d.extreme ? ' ⚠' : ''} ${d.trend === 'rising' ? '↑' : d.trend === 'falling' ? '↓' : '→'}`;
                          const color = isOi
                            ? (d.trend === 'rising' ? '#22c55e' : d.trend === 'falling' ? '#ef4444' : 'var(--text)')
                            : (d.extreme ? '#f59e0b' : '#22c55e');
                          return (
                            <span key={i} style={{ fontSize: '11px', fontWeight: 600, color, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: '4px', padding: '1px 7px', fontFamily: 'monospace' }}>
                              {val}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button onClick={resetAll} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}>
                    Ganti
                  </button>
                </div>
              )}

              <button onClick={runCSVAnalysis} disabled={!candles} style={{
                padding: '13px', borderRadius: '8px', border: 'none',
                background: candles ? accent : 'var(--border)',
                color: candles ? '#000' : 'var(--muted)',
                fontWeight: 700, fontSize: '15px', opacity: !candles ? 0.55 : 1, transition: 'all 0.15s', cursor: candles ? 'pointer' : 'default',
              }}>
                Analyze Chart
              </button>
            </>
          )}

          {/* Server / processing error */}
          {serverError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 16px', color: '#f87171', fontSize: '13px' }}>
              {serverError}
            </div>
          )}
        </div>

        {/* Right column — result, only takes space once there is one */}
        {hasResult && (
          <div style={{ flex: '1 1 480px', minWidth: '320px', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <AnalysisResult
              analysis={analysis}
              accent={accent}
              inputMode={inputMode}
              geminiData={geminiData}
              frOiData={frOiData}
            />
          </div>
        )}
      </div>

      <p style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '16px', maxWidth: '720px' }}>
        CSV: 100% browser, no data leaves your machine.{' '}
        Screenshot: image sent to your local server → NVIDIA API only.{' '}
        FR/OI: fetched from Binance public API.
        <br />Not financial advice. Technical analysis only.
      </p>
    </div>
  );
}

// ── Fallback analysis when no OHLCV candles loaded ───────────────────────────
function analyzeFromExtract(market, gemini, opts, symbol, timeframe, tradeStyle) {
  const { htfBias, fundingRate: fr, openInterest: oi, cvdTrend: cvdB } = opts ?? {};

  const g = gemini ?? {};
  const trend    = g.trend_visual ?? 'ranging';
  const rsiVal   = g.rsi;
  const volNote  = g.volume_note ?? 'unknown';
  const cvdSpot  = g.cvd_spot;
  const cvdFut   = g.cvd_futures;
  const gFr      = g.funding_rate;

  // Bias from Gemini visual
  let bias = trend === 'bullish' ? 'Bullish' : trend === 'bearish' ? 'Bearish' : 'Neutral';
  const warnings = [];
  const confidence_score = { n: 0 };
  function score_up() { confidence_score.n++; }

  // Apply squeeze rules
  const frVal     = fr?.value ?? gFr;
  const frExtreme = fr?.extreme ?? (frVal != null && Math.abs(frVal) > 0.0001);
  const oiTrend   = oi?.trend ?? 'neutral';
  const cvdBias   = cvdB ?? (cvdSpot != null ? (cvdSpot > 0 ? 'bullish' : 'bearish') : 'neutral');

  if (frExtreme && frVal > 0 && oiTrend === 'rising' && cvdBias === 'bearish') {
    warnings.push(`⚠ Long squeeze risk — FR extreme+, OI rising, CVD bearish`);
    if (bias === 'Bullish') bias = 'Avoid';
  }
  if (frExtreme && frVal < 0 && oiTrend === 'rising' && cvdBias === 'bullish') {
    warnings.push(`⚠ Short squeeze risk — FR extreme−, OI rising, CVD bullish`);
    if (bias === 'Bearish') bias = 'Avoid';
  }
  if (frExtreme) warnings.push(`Extreme funding ${fmtFR(frVal)} — flush risk`);
  if (htfBias && htfBias !== 'Neutral' && htfBias !== bias)
    warnings.push(`HTF bias (${htfBias}) conflicts with visual bias (${bias})`);

  // Confidence scoring
  if (trend !== 'ranging') score_up();
  if (rsiVal != null && ((bias === 'Bullish' && rsiVal < 70) || (bias === 'Bearish' && rsiVal > 30))) score_up();
  if (!frExtreme && oiTrend === 'rising' && cvdBias === bias.toLowerCase()) score_up();
  if (cvdSpot != null && cvdBias === bias.toLowerCase()) score_up();
  const confidence = confidence_score.n >= 3 ? 'High' : confidence_score.n >= 2 ? 'Medium' : 'Low';

  // ORDER FLOW line
  const ofParts = [];
  if (cvdSpot != null)  ofParts.push(`Spot CVD: ${cvdSpot > 0 ? 'Positive ↑' : 'Negative ↓'}`);
  if (cvdFut  != null)  ofParts.push(`Futures CVD: ${cvdFut > 0 ? 'Positive' : 'Negative'}`);
  if (fr?.value != null) ofParts.push(`FR: ${fmtFR(fr.value)} ${fr.trend === 'rising' ? '↑' : fr.trend === 'falling' ? '↓' : '→'}${fr.extreme ? ' ⚠' : ''}`);
  if (oi?.value != null) ofParts.push(`OI: ${fmtOI(oi.value)} ${oi.trend === 'rising' ? '↑' : oi.trend === 'falling' ? '↓' : '→'}`);

  const rsiLine = rsiVal != null ? `RSI ${rsiVal.toFixed(1)}${rsiVal > 70 ? ' (overbought)' : rsiVal < 30 ? ' (oversold)' : ''}` : 'RSI: not visible';

  return [
    `BIAS: ${bias}`,
    `PATTERN: ${trend === 'bullish' ? 'Visual uptrend' : trend === 'bearish' ? 'Visual downtrend' : 'Ranging / unclear'} (vision model read)`,
    `ENTRY ZONE: See chart — load CSV for calculated levels`,
    `STOP: Use nearest visible support/resistance on chart`,
    `TARGET 1: Use next visible resistance/support on chart`,
    `R:R: Manual — no OHLCV data for calculation`,
    `CONFIDENCE: ${confidence}`,
    ofParts.length ? `ORDER FLOW: ${ofParts.join(' · ')}` : null,
    warnings.length ? `WARNINGS: ${warnings.join(' | ')}` : null,
    `NOTES: Vision model visual: ${trend} trend. ${rsiLine}. Volume: ${volNote}. Symbol: ${symbol ?? 'unknown'}, TF: ${timeframe ?? 'unknown'}.`,
    ``,
    `Not financial advice. Technical analysis only.`,
  ].filter(Boolean).join('\n');
}

// Small helpers used only in App (avoid importing formatFR/formatOI to keep bundle clean)
function fmtFR(v) { return v == null ? 'N/A' : `${(v * 100).toFixed(4)}%`; }
function fmtOI(v) {
  if (v == null) return 'N/A';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
function formatFRShort(v) { return v == null ? 'N/A' : `${(v * 100).toFixed(4)}%`; }
function formatOIShort(v) { return fmtOI(v); }
