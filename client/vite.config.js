import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where the API runs in development. Override with API_TARGET (e.g. to run a second test copy).
const apiTarget = process.env.API_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs separately; proxying keeps the session cookie same-origin.
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
