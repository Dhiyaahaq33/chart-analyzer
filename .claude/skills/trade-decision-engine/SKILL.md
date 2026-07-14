# Trade Decision Engine Skill

## Purpose
Provide structured trade-analysis rules for chart images across three asset classes.
Each class has its own logic — they must NEVER bleed into each other.

---

## CRYPTO Analysis Rules

**Context:** High-volatility, 24/7, order-flow driven, momentum-derivative markets.

**System prompt goal:** Identify momentum breakouts, trend continuations, and derivative-driven squeezes.

**Key metrics (check in order):**
1. **Trend structure** — Higher highs / higher lows (uptrend) or LH/LL (downtrend). Call it clearly.
2. **Volume confirmation** — Is volume expanding on breakout candles? Contracting on pullbacks?
3. **Key S/R levels** — Identify the 2–3 most structurally significant price levels on the chart.
4. **Momentum** — RSI overbought/oversold, MACD cross or divergence if visible.
5. **Pattern** — Name the pattern only if it's unambiguous (e.g. bull flag, descending wedge, H&S).

**R:R gate:** Only recommend entry if estimated R:R ≥ 2:1. If not, say "No trade — unfavorable R:R."

**Output format:**
```
BIAS: [Bullish / Bearish / Neutral]
PATTERN: [name or "None identified"]
ENTRY ZONE: [price or range]
STOP: [level and reason]
TARGET 1: [level]
TARGET 2: [level, optional]
R:R: [ratio]
CONFIDENCE: [Low / Medium / High]
NOTES: [1–3 sentences on the key driver]
```

---

## FOREX Analysis Rules

**Context:** Macro-driven, session-based, institutional order-flow, mean-reverting at extremes.

**System prompt goal:** Identify high-probability setups based on structure, session context, and institutional levels.

**Key metrics (check in order):**
1. **Higher-timeframe bias** — What is the HTF trend? Don't fight it without a strong reason.
2. **Session context** — London / New York / Asia overlap? Relevant to volatility expectation.
3. **Key levels** — Previous day high/low, weekly open, round numbers, liquidity pools.
4. **Candlestick confluence** — Engulfing, pin bar, or inside bar at a key level = higher probability.
5. **ATR / volatility** — Is the current candle range within normal ATR? Avoid chasing extended moves.

**R:R gate:** Only recommend entry if estimated R:R ≥ 1.5:1 (forex spreads reduce margin).

**Output format:**
```
BIAS: [Bullish / Bearish / Neutral]
SESSION: [London / New York / Asia / Overlap / Unknown]
KEY LEVEL: [the level driving the setup]
ENTRY ZONE: [price or range]
STOP: [level and reason]
TARGET 1: [level]
TARGET 2: [level, optional]
R:R: [ratio]
CONFIDENCE: [Low / Medium / High]
NOTES: [1–3 sentences on HTF context and entry trigger]
```

---

## STOCKS Analysis Rules

**Context:** Volume-structure driven, catalyst-sensitive, earnings and sector rotation cycles.

**System prompt goal:** Identify institutional accumulation/distribution patterns and breakouts with volume.

**Key metrics (check in order):**
1. **Trend phase** — Accumulation, markup, distribution, or markdown (Wyckoff framework).
2. **Volume profile** — Is volume above average on up days and below on down days? (healthy uptrend)
3. **Moving averages** — Price vs. 20/50/200 MA. Are MAs aligned or converging?
4. **Relative strength** — Is this stock stronger or weaker than its sector/index? Note if visible.
5. **Catalyst zone** — Is price near an earnings gap, news level, or prior high-volume node?

**R:R gate:** Only recommend entry if estimated R:R ≥ 2:1 for swing trades.

**Output format:**
```
BIAS: [Bullish / Bearish / Neutral]
PHASE: [Accumulation / Markup / Distribution / Markdown / Unclear]
VOLUME SIGNAL: [Confirming / Non-confirming / Neutral]
ENTRY ZONE: [price or range]
STOP: [level and reason]
TARGET 1: [level]
TARGET 2: [level, optional]
R:R: [ratio]
CONFIDENCE: [Low / Medium / High]
NOTES: [1–3 sentences on volume + structure context]
```

---

## Cross-asset contamination rules (HARD)

- A crypto analysis response MUST NOT mention "sessions", "macro", or "MA alignment" as a primary driver.
- A forex analysis response MUST NOT mention "squeeze", "funding rate", or "derivative momentum".
- A stocks analysis response MUST NOT mention "funding", "liquidation cascade", or "perpetual futures".

Violating these rules means the system prompts are not isolated. Regenerate if contamination is found.

---

## Updating thresholds

Edit the R:R gates, metric order, or output fields in this file.
Then ask Claude Code: "Regenerate the three server system prompts from SKILL.md" and it will update `server/src/prompts.js` automatically.
