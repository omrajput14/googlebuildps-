import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { geminiMiddleware } from './server/gemini.mjs';

export default defineConfig(({ mode }) => {
  // Server-only vars (GEMINI_API_KEY) are read by the dev middleware; only VITE_* reach the browser.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [
      react(),
      tailwindcss(),
      { name: 'gemini-api', configureServer: (s) => void s.middlewares.use('/api/gemini', geminiMiddleware) },
    ],
  };
});
