import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// In development the website runs on Vite and the API on the Cover server (api/, port 8800).
const api = process.env.COVER_API || "http://localhost:8800";
export default defineConfig({
  plugins: [react()],
  server: { proxy: Object.fromEntries(["/api", "/mcp", "/paypal", "/mock-paypal", "/a2a", "/.well-known", "/llms.txt"].map((p) => [p, { target: api, changeOrigin: false }])) },
});
