import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: sesuaikan dengan nama repo GitHub kamu
// Contoh: repo "chart-analyzer" → base: '/chart-analyzer/'
// Kalau pakai custom domain atau root repo → base: '/'
const REPO_NAME = 'chart-analyzer';

export default defineConfig({
  plugins: [react()],
  base: `/${REPO_NAME}/`,
  server: {
    port: 5173,
    // Proxy /api → local server for screenshot mode in dev.
    // In production, set VITE_API_URL=https://your-render-server.com in Vercel dashboard.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
