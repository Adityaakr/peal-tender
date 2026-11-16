import { defineConfig } from "vite";

/**
 * QoreChain's REST API and CometBFT RPC send no CORS headers, so the app reaches
 * them through same-origin paths. Locally this dev server forwards them; hosted,
 * vercel.json's rewrites do the same. Both only ever forward to these two public
 * testnet endpoints.
 */
export default defineConfig({
  server: {
    proxy: {
      "/api/qore/rest": {
        target: "https://api-testnet.qore.host",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/qore\/rest/, ""),
      },
      "/api/qore/rpc": {
        target: "https://rpc-testnet.qore.host",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/qore\/rpc/, ""),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
});
