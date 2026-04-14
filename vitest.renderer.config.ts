import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    },
  },
})
