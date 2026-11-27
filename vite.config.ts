import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import pkg from './package.json' with { type: 'json' }

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
  // Settings → Giới thiệu: app version and the commit it was built from (CI sets GITHUB_SHA).
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_APP_BUILD': JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7)),
  },
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
