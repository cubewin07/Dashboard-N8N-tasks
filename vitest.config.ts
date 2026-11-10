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
      include: ['src/domain/**/*.ts'],
      exclude: [
        'src/domain/**/__tests__/**',
        'src/domain/**/__fixtures__/**',
        'src/domain/index.ts',
      ],
      thresholds: {
        'src/domain/**/*.ts': {
          lines: 90,
        },
      },
    },
  },
})
