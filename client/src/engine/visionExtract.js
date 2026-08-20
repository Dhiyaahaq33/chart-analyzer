const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SERVER_URL = `${API_BASE}/api/vision-extract`;

/** Convert File to base64 string (without data: prefix) */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Read chart data off a screenshot via the local server proxy (NVIDIA Nemotron Nano
 *  VL 8B — no CORS support for direct browser calls). CVD/OI/Funding are only asked
 *  for on crypto — forex/stock charts don't carry that data and the model hallucinates
 *  garbage values when forced to fill fields that aren't on screen.
 *  @param {'crypto'|'forex'|'stocks'} market */
export async function getVisionExtract(imageFile, market = 'crypto') {
  const base64Image = await fileToBase64(imageFile);

  let response;
  try {
    response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, mimeType: imageFile.type, market }),
    });
  } catch {
    throw new Error('Server not reachable — run `npm run dev` in server/ with NVIDIA_API_KEY set (see server/.env.example).');
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.extracted;
}
