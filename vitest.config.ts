import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@m8/protocol/validate': fileURLToPath(new URL('./packages/protocol/src/validate.ts', import.meta.url)),
      '@m8/avatars': fileURLToPath(new URL('./packages/avatars/src/index.ts', import.meta.url)),
      '@m8/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@m8/protocol': fileURLToPath(new URL('./packages/protocol/src/index.ts', import.meta.url)),
      '@m8/tokens': fileURLToPath(new URL('./packages/tokens/src/index.ts', import.meta.url)),
      '@m8/transport': fileURLToPath(new URL('./packages/transport/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
