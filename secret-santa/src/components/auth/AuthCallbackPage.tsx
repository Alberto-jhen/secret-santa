import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { safeReturnTo } from '../../lib/authRedirect'
import { useTranslation } from '../../i18n/useTranslation'
import { PageContainer } from '../ui/PageContainer'

export function AuthCallbackPage() {
  const { loading, user } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  useEffect(() => {
    if (!loading && user) {
      navigate(returnTo, { replace: true })
    }
  }, [loading, navigate, returnTo, user])

  return (
    <section className="bg-[#f2f5ef] px-4 py-16">
      <PageContainer className="max-w-[560px] rounded-3xl border border-[#d7e0d7] bg-white p-8 text-center shadow-[0_24px_70px_rgba(24,53,44,0.1)] sm:p-12">
        {loading || user ? (
          <p aria-live="polite" className="m-0 text-sm text-[#52655a]">
            {t('authCheckingSession')}
          </p>
        ) : (
          <>
            <h1 className="m-0 font-display text-3xl text-[#18352c]">
              {t('authCallbackFailedTitle')}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#52655a]">
              {t('authCallbackFailedDescription')}
            </p>
            <Link
              className="mt-5 inline-flex font-semibold text-[#174b3a] underline underline-offset-4"
              to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            >
              {t('loginLink')}
            </Link>
          </>
        )}
      </PageContainer>
    </section>
  )
}
