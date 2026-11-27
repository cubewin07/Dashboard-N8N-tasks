import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { BackendGate } from '@/app/BackendGate'
import { I18nProvider } from '@/i18n'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BackendGate>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </BackendGate>
    </I18nProvider>
  </StrictMode>,
)
