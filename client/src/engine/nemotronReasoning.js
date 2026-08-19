const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SERVER_URL = `${API_BASE}/api/nemotron-reasoning`;

/** Ask NVIDIA's Llama-3.1-Nemotron-Nano-8B-v1 (via local server proxy — NVIDIA's API has no
 *  CORS support for direct browser calls) for a plain-language reasoning summary of an
 *  already-computed analysis. Never used to derive trading numbers. */
export async function getNemotronReasoning(analysisText) {
  let response;
  try {
    response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis: analysisText }),
    });
  } catch {
    throw new Error('Server not reachable — run `npm run dev` in server/ with NVIDIA_API_KEY set (see server/.env.example).');
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.reasoning;
}
