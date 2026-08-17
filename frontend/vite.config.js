import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_DEV_PORT || 5173),
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_API || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
