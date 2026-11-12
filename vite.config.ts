import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const useSimStub =
  process.env.VITE_SIM_STUB === '1' || process.env.VITE_FEED === 'none'

const stubPath = path.resolve(
  import.meta.dirname,
  './src/adapters/_nosim/index.ts',
)

function simStubPlugin(): Plugin {
  return {
    name: 'sim-stub-plugin',
    load(id: string) {
      if (id.includes('/i18n/vi/sim') || id.includes('/i18n/en/sim')) {
        return 'export const sim = {}; export default sim;'
      }
      return null
    },
  }
}

export default defineConfig({
  base: '/Dashboard-N8N-tasks/',
  plugins: [
    ...(useSimStub ? [simStubPlugin()] : []),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      ...(useSimStub
        ? {
            '@/adapters/sim': stubPath,
          }
        : {}),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
