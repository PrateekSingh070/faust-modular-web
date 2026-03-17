import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    // Copy libfaust-wasm.{js,wasm,data} to the build root so the browser
    // can fetch them at /libfaust-wasm.* (glob catches whichever files exist)
    viteStaticCopy({
      targets: [
        {
          // In @grame/faustwasm ≥ 0.6, the binary assets live in libfaust-wasm/
          // (not dist/). The static-copy plugin serves them at / so the browser
          // can fetch /libfaust-wasm.js, /libfaust-wasm.wasm, /libfaust-wasm.data
          src: "node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm*",
          dest: ".",
        },
      ],
    }),
  ],
  optimizeDeps: {
    // Don't let Vite pre-bundle faustwasm – it contains WASM assets
    exclude: ["@grame/faustwasm"],
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by the Faust WASM runtime)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
