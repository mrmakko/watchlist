import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Frontend lives in web/, builds to web/dist (served by express in prod).
export default defineConfig({
  root: 'web',
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      // dev: proxy API calls to the node server
      '/api': 'http://localhost:3000'
    }
  }
});
