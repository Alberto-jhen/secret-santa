import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../i18n/useTranslation'

export function AuthRequiredRoute() {
  const { loading, user } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  if (loading) {
    return (
      <section className="grid min-h-[420px] place-items-center bg-[#f2f5ef] px-4 py-12">
        <p aria-live="polite" className="text-sm font-medium text-[#345246]">
          {t('authCheckingSession')}
        </p>
      </section>
    )
  }

  if (!user) {
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
      />
    )
  }

  return <Outlet />
}
