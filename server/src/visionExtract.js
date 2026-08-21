const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// Was nvidia/llama-3.1-nemotron-nano-vl-8b-v1 (8B) — too small, routinely hallucinated
// values for fields it couldn't find on screen (echoed price into CVD, RSI out of 0-100
// range, garbage funding-rate percentages). 90B has much stronger instruction-following
// for "return null if not visible" and reads small chart labels more reliably.
const MODEL = 'meta/llama-3.2-90b-vision-instruct';

// Crypto perpetual-futures charts (Binance/Bybit style) carry CVD/OI/Funding overlays.
// Forex and stock charts never do — asking the 8B model for fields that aren't on
// screen makes it hallucinate (e.g. echoing price into CVD, garbage % into funding_rate,
// out-of-range RSI). Keep the schema per-market so it only ever extracts what's visible.
const CRYPTO_EXTRACT_PROMPT = `You are a trading data extractor. Look at this chart screenshot carefully.
Extract ONLY these values as JSON, nothing else:

{
  "price": <current price as number or null>,
  "cvd_spot": <spot CVD value as number or null>,
  "cvd_futures": <futures CVD value as number or null>,
  "open_interest": <OI value as number or null>,
  "funding_rate": <funding rate as number or null>,
  "rsi": <RSI value as number or null>,
  "volume_note": "<expanding|contracting|neutral>",
  "trend_visual": "<bullish|bearish|ranging>"
}

cvd_spot, cvd_futures, open_interest, and funding_rate are ONLY present if this chart has a
separate labeled panel or badge explicitly named "CVD", "OI"/"Open Interest", or "Funding"/"FR" —
most chart screenshots do NOT have these panels. Do not infer, estimate, or guess these values.
NEVER copy the price into cvd_spot, cvd_futures, or open_interest — they are unrelated numbers.
funding_rate is a small decimal like 0.0001 (meaning 0.01%), never a whole number like 1 or 100.
If you do not see a field's dedicated labeled panel on screen, return null for it — null is the
correct and expected answer for most of these fields on most charts.
Numbers must be plain JSON numbers with NO thousand separators — write 63786.6, never 63,786.6.
Return ONLY the JSON object, no explanation.`;

const SPOT_EXTRACT_PROMPT = `You are a trading data extractor. Look at this chart screenshot carefully.
This is a forex or stock chart — it has NO CVD, open interest, or funding rate data. Do not invent them.
Extract ONLY these values as JSON, nothing else:

{
  "price": <current price as number or null>,
  "rsi": <RSI value as number or null, must be between 0 and 100>,
  "volume_note": "<expanding|contracting|neutral>",
  "trend_visual": "<bullish|bearish|ranging>"
}

If a value is not visible in the chart, return null for that field.
Numbers must be plain JSON numbers with NO thousand separators — write 4514.5, never 4,514.5.
Return ONLY the JSON object, no explanation.`;

/** Read chart data off a screenshot via NVIDIA's Nemotron Nano VL 8B.
 *  Server-side only — NVIDIA's API has no CORS support for direct browser calls.
 *  @param {'crypto'|'forex'|'stocks'} market — selects which fields the model is asked for. */
export async function extractChartData(base64Image, mimeType, apiKey, market = 'crypto') {
  const EXTRACT_PROMPT = market === 'crypto' ? CRYPTO_EXTRACT_PROMPT : SPOT_EXTRACT_PROMPT;
  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      }],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error('Vision extract: ' + (data.error?.message || `HTTP ${response.status}`));
  }

  const text = data.choices[0].message.content;
  const extracted = parseJsonLoose(text);
  sanitizeExtracted(extracted);
  return extracted;
}

/** The 8B model is inconsistent about admitting it can't see CVD/OI/Funding —
 *  it sometimes fabricates a value instead of returning null (usually by echoing
 *  price, or a suspiciously round percentage). These checks catch the fabrication
 *  patterns actually observed, in place, rather than trusting the model's honesty. */
function sanitizeExtracted(extracted) {
  // RSI is bounded [0,100] by definition.
  if (extracted.rsi != null && (extracted.rsi < 0 || extracted.rsi > 100)) {
    extracted.rsi = null;
  }

  const price = extracted.price;
  const echoesPrice = (v) => price != null && v != null && Math.abs(v - price) / price < 0.05;

  // CVD and OI are unrelated in scale/sign to price — a value within 5% of price
  // is the model echoing what it already read for "price", not a real reading.
  if (echoesPrice(extracted.cvd_spot))    extracted.cvd_spot = null;
  if (echoesPrice(extracted.cvd_futures)) extracted.cvd_futures = null;
  if (echoesPrice(extracted.open_interest)) extracted.open_interest = null;

  // Real perpetual funding rates run roughly ±0.01%–0.1%, rarely beyond ±0.5%
  // even at extremes. Anything beyond ±0.8% (0.008 as a decimal) is fabricated —
  // a suspiciously round guess like "1.0000%" is a known failure pattern.
  if (extracted.funding_rate != null && Math.abs(extracted.funding_rate) > 0.008) {
    extracted.funding_rate = null;
  }
}

/** Small models occasionally emit near-valid JSON — stray prose around the object,
 *  a trailing comma before a closing brace. Strip markdown fences, isolate the
 *  {...} block, drop trailing commas, then parse. Throws with a text snippet if
 *  it's still not recoverable. */
export function parseJsonLoose(text) {
  let cleaned = text.replace(/```json|```/g, '').trim();

  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');   // trailing comma before } or ]
  cleaned = cleaned.replace(/(\d),(\d{3}\b)/g, '$1$2'); // thousand separators inside numbers, e.g. 63,786 -> 63786

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Vision extract: model returned malformed JSON (${e.message}). Raw: ${text.slice(0, 200)}`);
  }
}
