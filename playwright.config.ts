import { defineConfig } from '@playwright/test'

const CHROMIUM_ARGS = [
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

// E2E_PORT lets parallel checkouts (worktrees) each run their own preview server.
const PORT = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each desktop page renders WebGL in software and decodes ~70 models; more
  // than 3 at once starves the CPU and times out unrelated specs.
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI
    ? [['./e2e/support/progress-reporter.ts'], ['github'], ['html', { open: 'never' }]]
    : [['./e2e/support/progress-reporter.ts']],
  use: {
    baseURL: `http://localhost:${PORT}/Dashboard-N8N-tasks/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: CHROMIUM_ARGS,
    },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/Dashboard-N8N-tasks/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_E2E: '1',
      VITE_DEBUG: '1',
      // E2E runs against the demo accounts. Blank values override a developer's .env.local,
      // which would otherwise build the app in Supabase mode.
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
    },
  },
})
