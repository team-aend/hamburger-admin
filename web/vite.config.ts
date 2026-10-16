import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 개발 서버는 /api 요청을 관리자 서버(4100)로 넘긴다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.ADMIN_SERVER_URL ?? 'http://localhost:4100',
        changeOrigin: false,
      },
    },
  },
});
