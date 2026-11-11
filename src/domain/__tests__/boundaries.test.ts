import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

describe('ESLint architectural boundaries (R7)', () => {
  const eslint = new ESLint()

  it('rejects react, three, @react-three/*, @/adapters/*, @/office/*, @/features/* imports in src/domain/**', async () => {
    const code = [
      "import { useState } from 'react'",
      "import * as THREE from 'three'",
      "import { Canvas } from '@react-three/fiber'",
      "import { x } from '@/adapters/local/StaticFeed'",
      "import { y } from '@/office/store'",
      "import { z } from '@/features/org/OrgPage'",
      'export const v = [useState, THREE, Canvas, x, y, z]',
    ].join('\n')

    const [result] = await eslint.lintText(code, { filePath: 'src/domain/x.ts' })
    const restricted = (result?.messages ?? []).filter(
      (m) => m.ruleId === 'no-restricted-imports',
    )
    expect(restricted.length).toBeGreaterThanOrEqual(6)
  })

  it('rejects Date.now(), no-arg new Date(), and Math.random() in src/domain/** and src/scene/{layout,nav,director}/**', async () => {
    const code =
      'export const a = Date.now(); export const b = new Date(); export const c = Math.random();\n'
    const [domainRes] = await eslint.lintText(code, { filePath: 'src/domain/x.ts' })
    const [sceneRes] = await eslint.lintText(code, {
      filePath: 'src/scene/director/x.ts',
    })

    expect(
      domainRes?.messages.filter((m) => m.ruleId === 'no-restricted-syntax'),
    ).toHaveLength(3)
    expect(
      sceneRes?.messages.filter((m) => m.ruleId === 'no-restricted-syntax'),
    ).toHaveLength(3)
  })

  it('rejects @/adapters/** imports outside allowed files, and allows them in feedRegistry/configStore/providers', async () => {
    const code = "import { StaticFeed } from '@/adapters/local/StaticFeed'\nexport const f = StaticFeed\n"

    const [forbiddenRes] = await eslint.lintText(code, {
      filePath: 'src/features/office/OfficePage.tsx',
    })
    expect(
      forbiddenRes?.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
    ).toHaveLength(1)

    const [allowedRes] = await eslint.lintText(code, {
      filePath: 'src/office/feedRegistry.ts',
    })
    expect(
      allowedRes?.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
    ).toHaveLength(0)
  })

  it('rejects @/adapters/sim imports in scene and providers, and allows them only in feedRegistry (P03-T17)', async () => {
    const code = "import * as sim from '@/adapters/sim'\nexport const s = sim\n"

    const [canvasRes] = await eslint.lintText(code, {
      filePath: 'src/scene/OfficeCanvas.tsx',
    })
    expect(
      canvasRes?.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
    ).toHaveLength(1)

    const [providersRes] = await eslint.lintText(code, {
      filePath: 'src/app/providers.tsx',
    })
    expect(
      providersRes?.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
    ).toHaveLength(1)

    const [registryRes] = await eslint.lintText(code, {
      filePath: 'src/office/feedRegistry.ts',
    })
    expect(
      registryRes?.messages.filter((m) => m.ruleId === 'no-restricted-imports'),
    ).toHaveLength(0)
  })
})
