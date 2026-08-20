import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@m8/protocol': fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
    },
  },
  build: {
    // Chromium 68-79 on 2020-2021 Tizen and webOS. No optional chaining, no
    // nullish coalescing may survive into the output; CI parses the bundle.
    target: 'es2017',
    modulePreload: { polyfill: false },
  },
  esbuild: {
    target: 'es2017',
  },
})
