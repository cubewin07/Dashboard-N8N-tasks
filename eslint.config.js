import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.agents',
      '.claude',
      '.herdr-tasks',
      'e2e',
      'scripts',
      'art',
      'coverage',
      'playwright-report',
      'test-results',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/adapters/sim/**/*.{ts,tsx}',
      'src/adapters/replay/__tests__/**/*.{ts,tsx}',
      'src/office/feedRegistry.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/adapters/sim',
                '@/adapters/sim/*',
                '@/adapters/sim/**',
                '**/adapters/sim',
                '**/adapters/sim/*',
                '**/adapters/sim/**',
              ],
              message:
                'Only src/office/feedRegistry.ts may import from src/adapters/sim.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/adapters/**/*.{ts,tsx}',
      'src/office/feedRegistry.ts',
      'src/office/configStore.ts',
      'src/office/__tests__/**/*.{ts,tsx}',
      'src/app/providers.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/adapters/*', '@/adapters/**', '**/adapters/*'],
              message:
                'Adapters may only be imported in src/office/feedRegistry.ts, src/office/configStore.ts, or src/app/providers.tsx.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/domain/**/*.{ts,tsx}',
      'src/scene/layout/**/*.{ts,tsx}',
      'src/scene/nav/**/*.{ts,tsx}',
      'src/scene/director/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Pure domain/scene modules must not import React.' },
            { name: 'react-dom', message: 'Pure domain/scene modules must not import React DOM.' },
            { name: 'three', message: 'Pure domain/scene modules must not import Three.js.' },
          ],
          patterns: [
            {
              group: [
                'react/*',
                '@react-three/*',
                'three/*',
                '@/adapters/*',
                '@/adapters/**',
                '**/adapters/*',
                '@/office/*',
                '@/office/**',
                '@/features/*',
                '@/features/**',
                '@/app/*',
                '@/app/**',
              ],
              message:
                'Pure domain/scene modules must not import React, Three, adapters, office, features, or app.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Do not call Date.now() in pure domain/scene modules; pass timestamps from the feed clock.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Do not call new Date() without arguments in pure domain/scene modules; pass timestamps from the feed clock.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Do not call Math.random() in pure domain/scene modules; use a seeded RNG passed as an argument.',
        },
      ],
    },
  },
)
