import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Hosting services (Render, Cloud Run…) tell the app which port to use.
const port = Number(process.env.PORT) || 3000;

export default defineConfig({
  // Relative asset paths: the build works at any address (Render, a sub-folder, a static preview).
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 3000, host: '0.0.0.0' },
  // Web workers (MapLibre's) as ES modules, like the rest of the app.
  worker: { format: 'es' },
  preview: { port, host: '0.0.0.0', allowedHosts: true },
});
