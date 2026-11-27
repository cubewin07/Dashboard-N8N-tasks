import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { vi, type Messages } from './vi'

export type Lang = 'vi' | 'en'
export type { Messages }
const STORAGE_KEY = 'shophq.lang'

/**
 * Vietnamese is the default and ships in the first download. English is a lazy chunk
 * (P11-T03): it loads on the first switch, or at start when a browser stored 'en'.
 */
const dictionaries: Partial<Record<Lang, Messages>> = { vi }

async function loadDictionary(lang: Lang): Promise<Messages> {
  const loaded = dictionaries[lang]
  if (loaded) return loaded
  const { en } = await import('./en')
  dictionaries.en = en
  return en
}

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: Messages
}
const I18nContext = createContext<I18nValue | null>(null)

function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

function persist(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode: language just won't persist */
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Show Vietnamese until a stored English dictionary has arrived (one short chunk).
  const [lang, setLangState] = useState<Lang>(() => {
    const wanted = storedLang()
    return dictionaries[wanted] ? wanted : 'vi'
  })

  useEffect(() => {
    const wanted = storedLang()
    if (wanted === lang) return
    let cancelled = false
    void loadDictionary(wanted).then(() => {
      if (!cancelled) setLangState(wanted)
    })
    return () => {
      cancelled = true
    }
    // Only on mount: later switches go through setLang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Also on first load: a stored 'en' must not keep the hard-coded lang="vi".
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t: dictionaries[lang] ?? vi,
      setLang: (l) => {
        persist(l)
        if (dictionaries[l]) {
          setLangState(l)
          return
        }
        void loadDictionary(l).then(() => setLangState(l))
      },
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** `const { t, lang } = useI18n(); t.common.nav.office` — use fmt() from lib/utils for {placeholders}. */
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
