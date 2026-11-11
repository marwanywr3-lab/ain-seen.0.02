import { defineConfig } from "vite";
export default defineConfig({
  build: {
    rollupOptions: { input: { game: "index.html", admin: "admin.html" } },
  },
  server: {
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
