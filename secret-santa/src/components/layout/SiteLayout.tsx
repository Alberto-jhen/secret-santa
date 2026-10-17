import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from '../../i18n/useTranslation'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
function ScrollToLocation() {
  const { hash, pathname } = useLocation()

  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      })
      return
    }

    window.scrollTo({ top: 0 })
  }, [hash, pathname])

  return null
}

export function SiteLayout() {
  const { t } = useTranslation()
  return (
    <>
      <ScrollToLocation />
      <a
        className="fixed left-3 top-3 z-50 -translate-y-[160%] rounded-lg bg-forest-dark px-3.5 py-2.5 text-paper transition-transform focus:translate-y-0"
        href="#main-content"
      >
        {t('skipToContent')}
      </a>
      <div className="min-h-screen overflow-hidden">
        <SiteHeader />
        <main id="main-content">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </>
  )
}
