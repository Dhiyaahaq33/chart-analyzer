const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1';

const EXTRACT_PROMPT = `You are a trading data extractor. Look at this chart screenshot carefully.
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

If a value is not visible in the chart, return null for that field.
Numbers must be plain JSON numbers with NO thousand separators — write 63786.6, never 63,786.6.
Return ONLY the JSON object, no explanation.`;

/** Read CVD/OI/Funding/RSI/trend off a chart screenshot via NVIDIA's Nemotron Nano VL 8B.
 *  Server-side only — NVIDIA's API has no CORS support for direct browser calls. */
export async function extractChartData(base64Image, mimeType, apiKey) {
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
  return parseJsonLoose(text);
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
