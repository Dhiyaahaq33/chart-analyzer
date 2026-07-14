const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// ponytail: llama-3.1-nemotron-nano-8b-v1 hangs indefinitely on NVIDIA's backend (verified —
// other models on the same key respond in <3s). nemotron-3-nano-30b-a3b is the healthy successor.
const MODEL = 'nvidia/nemotron-3-nano-30b-a3b';

const SYSTEM_PROMPT = `You are a trading analysis reviewer. You will be given a structured technical
analysis (BIAS, ENTRY, STOP, TARGET, R:R, CONFIDENCE, WARNINGS, etc.) that was already computed by a
deterministic rule engine. Write a short 2-4 sentence plain-language reasoning summary for a trader.
Do NOT invent new price levels, do NOT change or restate the numbers as if you calculated them, and do
NOT contradict the stated BIAS. Only explain the "why" behind it and flag anything internally
inconsistent. If nothing is inconsistent, just explain the reasoning.`;

/** Ask NVIDIA's hosted Llama-3.1-Nemotron-Nano-8B-v1 (build.nvidia.com NIM) for a plain-language
 *  reasoning summary of an already-computed analysis. Server-side only — NVIDIA's API has no CORS
 *  support for direct browser calls. */
export async function getNemotronReasoning(analysisText, apiKey) {
  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: analysisText },
      ],
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 1024,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error('Nemotron: ' + (data.error?.message || `HTTP ${response.status}`));
  }
  return data.choices[0].message.content.trim();
}
