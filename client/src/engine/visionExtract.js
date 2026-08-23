const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SERVER_URL = `${API_BASE}/api/vision-extract`;

// TradingView screenshot exports commonly land at 1-2MB PNG — most of that is wasted
// on a dark, mostly-flat chart background. Downscaling + re-encoding trims upload and
// server-side processing time without hurting the vision model's read. Quality is kept
// high (0.9) and the max dimension generous (2000px) — this is about cutting oversized
// PNG bloat, not squeezing for minimum size, since the model needs to read small price/
// RSI labels precisely.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.9;

/** Downscale (if needed) and re-encode as JPEG via canvas. Falls back to the original
 *  file untouched if the browser can't do the canvas round-trip for any reason. */
async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale  = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width  = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob ? { blob, mimeType: 'image/jpeg' } : { blob: file, mimeType: file.type };
  } catch {
    return { blob: file, mimeType: file.type };
  }
}

/** Convert a File/Blob to base64 string (without data: prefix) */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Read chart data off a screenshot via the local server proxy (vision model — no CORS
 *  support for direct browser calls). CVD/OI/Funding are only asked for on crypto —
 *  forex/stock charts don't carry that data and the model hallucinates garbage values
 *  when forced to fill fields that aren't on screen.
 *  @param {'crypto'|'forex'|'stocks'} market */
export async function getVisionExtract(imageFile, market = 'crypto') {
  const { blob, mimeType } = await compressImage(imageFile);
  const base64Image = await fileToBase64(blob);

  let response;
  try {
    response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, mimeType, market }),
    });
  } catch {
    throw new Error('Server not reachable — run `npm run dev` in server/ with NVIDIA_API_KEY set (see server/.env.example).');
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.extracted;
}
