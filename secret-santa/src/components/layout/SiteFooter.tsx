import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n/useTranslation'
import { Brand } from '../ui/Brand'
import { PageContainer } from '../ui/PageContainer'

export function SiteFooter() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-line bg-[#f5f4ee]">
      <PageContainer className="grid grid-cols-2 items-center gap-x-6 gap-y-2.5 py-[27px] max-[720px]:grid-cols-1 max-[720px]:gap-3">
        <Brand />
        <p className="justify-self-end font-display text-xs italic text-[#77837a] max-[720px]:justify-self-start">
          {t('footerTagline')}
        </p>
        <div className="col-span-full mt-2 flex items-center justify-between border-t border-[#e5e7de] pt-[17px] text-[10px] text-[#89938a]">
          <span>
            © {new Date().getFullYear()} {t('brandName')}
          </span>
          <Link
            className="text-[10px] font-medium text-[#53645b] no-underline transition-colors hover:text-forest"
            to="/register"
          >
            {t('startDraw')}
          </Link>
        </div>
      </PageContainer>
    </footer>
  )
}
