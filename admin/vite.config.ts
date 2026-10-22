import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The types and rules in ../shared are shared with the server and the app.
    fs: { allow: ['..'] },
  },
});
