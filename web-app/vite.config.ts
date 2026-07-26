import { defineConfig } from 'vite';

export default defineConfig({
  base: '/image-developer/',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});