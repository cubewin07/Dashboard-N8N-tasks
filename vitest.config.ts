import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    testTimeout: 25_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/scene/layout/**/*.ts'],
      exclude: [
        'src/domain/**/__tests__/**',
        'src/domain/**/__fixtures__/**',
        'src/domain/index.ts',
        'src/scene/layout/**/__tests__/**',
        'src/scene/layout/index.ts',
        'src/scene/layout/types.ts',
      ],
      thresholds: {
        'src/domain/**/*.ts': {
          lines: 90,
        },
        'src/scene/layout/**/*.ts': {
          lines: 90,
        },
      },
    },
  },
})
