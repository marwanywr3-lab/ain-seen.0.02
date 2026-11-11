import { build } from "esbuild";
await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  external: ["cloudflare:workers"],
  outfile: ".worker-build/index.js",
});
await import("./local-worker.mjs");
const { createServer } = await import("vite");
const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const server = await createServer({
  server: {
    host: "0.0.0.0",
    port: Number(portArg < 0 ? process.env.PORT || 5173 : args[portArg + 1]),
  },
});
await server.listen();
server.printUrls();
