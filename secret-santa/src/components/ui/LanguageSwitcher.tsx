import { useTranslation } from '../../i18n/useTranslation'
import type { Locale } from '../../models'

interface LanguageSwitcherProps {
  className?: string
}

export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation()
  const nextLocale: Locale = locale === 'es' ? 'en' : 'es'
  const label = locale === 'es' ? t('switchToEnglish') : t('switchToSpanish')

  return (
    <button
      aria-label={label}
      className={`inline-flex min-h-9 min-w-10 items-center justify-center rounded-full border border-[#d8ded5] px-2 text-[11px] font-bold text-forest transition-colors hover:border-forest hover:bg-[#eef2e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
      onClick={() => setLocale(nextLocale)}
      title={label}
      type="button"
    >
      {nextLocale.toUpperCase()}
    </button>
  )
}
