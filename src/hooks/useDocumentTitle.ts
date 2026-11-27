import { useEffect } from 'react'
import { useI18n } from '@/i18n'

/** R13: the browser tab reads "Trang · Shop HQ", or just the app name (from i18n). */
export function useDocumentTitle(page?: string): void {
  const { t } = useI18n()
  const app = t.common.app.name
  useEffect(() => {
    document.title = page ? `${page} · ${app}` : app
  }, [page, app])
}
