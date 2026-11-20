import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';
  return {
  plugins: [react()],
  server: {
    open: false,
    proxy: { '/api': { target, changeOrigin: true }, '/health': { target, changeOrigin: true } },
    watch: {
      usePolling: true,
    },
  },
  };
});
