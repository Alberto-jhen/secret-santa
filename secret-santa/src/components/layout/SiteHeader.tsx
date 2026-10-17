import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n/useTranslation'
import { AuthHeaderActions } from '../auth/AuthHeaderActions'
import { Brand } from '../ui/Brand'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { PageContainer } from '../ui/PageContainer'

export function SiteHeader() {
  const { t } = useTranslation()
  return (
    <header className="relative z-20 border-b border-ink/10 bg-canvas/90">
      <PageContainer className="flex min-h-[82px] items-center justify-between gap-6 max-[720px]:min-h-[72px] max-[720px]:gap-2">
        <Brand />
        {/* Primary site navigation. */}
        <nav
          aria-label={t('navigationLabel')}
          className="ml-auto flex items-center gap-9 max-[720px]:hidden"
        >
          <Link
            className="text-[13px] font-medium text-[#53645b] no-underline transition-colors hover:text-forest"
            to="/#how-it-works"
          >
            {t('howItWorks')}
          </Link>
          <Link
            className="text-[13px] font-medium text-[#53645b] no-underline transition-colors hover:text-forest"
            to="/#benefits"
          >
            {t('whyChooseUs')}
          </Link>
          <LanguageSwitcher />
          <AuthHeaderActions />
        </nav>
      </PageContainer>
    </header>
  )
}
