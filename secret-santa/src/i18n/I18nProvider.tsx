import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { I18nContext } from './I18nContext'
import type { I18nContextValue, Locale } from '../models'
import type { TranslationKey } from './translations'
import { translations } from './translations'

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'es'
  }

  return window.localStorage.getItem('secret-santa-locale') === 'en'
    ? 'en'
    : 'es'
}

interface I18nProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale)

  useEffect(() => {
    const messages = translations[locale]

    document.documentElement.lang = locale
    document.title = messages.pageTitle
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', messages.pageDescription)
    window.localStorage.setItem('secret-santa-locale', locale)
  }, [locale])

  const value = useMemo<I18nContextValue<TranslationKey>>(
    () => ({
      locale,
      setLocale,
      t: (key) => translations[locale][key],
    }),
    [locale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
