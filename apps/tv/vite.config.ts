import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@m8/avatars': fileURLToPath(new URL('../../packages/avatars/src/index.ts', import.meta.url)),
      '@m8/protocol': fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
    },
  },
  build: {
    // Chromium 68-79 on 2020-2021 Tizen and webOS. No optional chaining, no
    // nullish coalescing may survive into the output; CI parses the bundle.
    target: 'es2017',
    modulePreload: { polyfill: false },
    // The two self-hosted fonts stay files. Inlined as base64 they would be
    // roughly a third larger, would be re-fetched with the stylesheet on
    // every deploy instead of being cached on their own, and would block the
    // first paint of a screen whose whole job is to not be blank.
    assetsInlineLimit: 0,
  },
  esbuild: {
    target: 'es2017',
  },
})
