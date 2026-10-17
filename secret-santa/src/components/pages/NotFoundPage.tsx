import { ButtonLink } from '../ui/ButtonLink'
import { useTranslation } from '../../i18n/useTranslation'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <section className="flex min-h-[570px] flex-col items-center justify-center px-6 py-[60px] text-center">
      <p className="mb-[19px] flex items-center justify-center gap-[9px] text-[10px] font-bold tracking-[0.15em] text-forest uppercase">
        {t('notFoundEyebrow')}
      </p>
      <h1 className="m-0 font-display text-[clamp(42px,6vw,64px)] leading-[0.99] font-medium tracking-[-0.055em] text-ink">
        {t('notFoundTitle')}
      </h1>
      <p className="mt-4 mb-[25px] text-sm text-muted-foreground">
        {t('notFoundDescription')}
      </p>
      <ButtonLink to="/">{t('notFoundCta')}</ButtonLink>
    </section>
  )
}
