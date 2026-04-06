import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['packages/backend/src/**/*.test.ts'],
    globals: true
  },
  resolve: {
    alias: {
      '@coding-bubble/shared': resolve(__dirname, 'packages/shared/src/index.ts')
    }
  }
})
