import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n/useTranslation'
import { Icon } from './Icon'

export function Brand() {
  const { t } = useTranslation()
  return (
    <Link
      aria-label={t('brandAriaLabel')}
      className="inline-flex items-center gap-2.5 text-ink no-underline"
      to="/"
    >
      <span className="grid size-[37px] place-items-center rounded-xl bg-lime text-forest">
        <Icon className="size-[21px]" name="gift" />
      </span>
      <span className="text-[17px] font-bold tracking-[-0.06em] max-[420px]:text-[13px]">
        {t('brandName')}
      </span>
    </Link>
  )
}
