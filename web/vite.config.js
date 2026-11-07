import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// In development the website runs on Vite and the API on the Done & Paid server (api/, port 8810).
const api = process.env.DONE_API || "http://localhost:8810";
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1600 },
  server: { proxy: Object.fromEntries(["/api", "/mcp", "/paypal", "/mock-paypal", "/a2a", "/.well-known", "/llms.txt"].map((p) => [p, { target: api, changeOrigin: false }])) },
});
