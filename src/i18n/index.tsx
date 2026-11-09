import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { vi, type Messages } from './vi'
import { en } from './en'

export type Lang = 'vi' | 'en'
const dictionaries: Record<Lang, Messages> = { vi, en }
const STORAGE_KEY = 'shophq.lang'

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: Messages
}
const I18nContext = createContext<I18nValue | null>(null)

function initialLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t: dictionaries[lang],
      setLang: (l) => {
        setLangState(l)
        document.documentElement.lang = l
        try {
          localStorage.setItem(STORAGE_KEY, l)
        } catch {
          /* private mode: language just won't persist */
        }
      },
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** `const { t, lang } = useI18n(); t.common.nav.overview` — use fmt() from lib/utils for {placeholders}. */
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
