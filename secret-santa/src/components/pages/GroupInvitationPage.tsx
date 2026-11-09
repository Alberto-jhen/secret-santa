import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { InvitationPreview } from '../../models'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../i18n/useTranslation'
import {
  previewGroupInvitation,
  respondToGroupInvitation,
} from '../../lib/groupApi'
import { toast } from '../../lib/toast'
import { PageContainer } from '../ui/PageContainer'
interface InvitationLoadResult {
  token: string
  preview: InvitationPreview | null
  hasError: boolean
}

function getInvitationToken(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? ''
}

export function GroupInvitationPage() {
  const { loading: authLoading, user } = useAuth()
  const { locale, t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const token = getInvitationToken(location.hash)
  const [invitationResult, setInvitationResult] =
    useState<InvitationLoadResult | null>(null)
  const [isResponding, setIsResponding] = useState(false)
  const [responseError, setResponseError] = useState('')

  useEffect(() => {
    let active = true
    if (!token) {
      return
    }

    previewGroupInvitation(token)
      .then((data) => {
        if (active) {
          setInvitationResult({
            token,
            preview: data,
            hasError: false,
          })
        }
      })
      .catch(() => {
        if (active) {
          setInvitationResult({
            token,
            preview: null,
            hasError: true,
          })
        }
      })

    return () => {
      active = false
    }
  }, [token])

  const currentResult =
    invitationResult?.token === token ? invitationResult : null
  const preview = currentResult?.preview ?? null
  const isLoading = Boolean(token) && currentResult === null
  const error = responseError || (
    !token
      ? t('groupInvitationTokenMissing')
      : currentResult?.hasError
        ? t('groupInvitationExpired')
        : ''
  )

  async function handleRespond(accept: boolean) {
    if (!token) {
      return
    }
    setResponseError('')
    setIsResponding(true)
    try {
      const result = await respondToGroupInvitation(token, accept)
      if (accept) {
        toast.add({
          type: 'success',
          title: t('brandName'),
          description: t('groupInvitationAccepted'),
        })
        navigate(`/groups/${result.groupId}`, { replace: true })
      } else {
        toast.add({
          type: 'info',
          title: t('brandName'),
          description: t('groupInvitationDeclined'),
        })
        navigate('/groups', { replace: true })
      }
    } catch (responseError) {
      const code =
        responseError instanceof Error ? responseError.message : ''
      setResponseError(
        code.includes('email')
          ? t('groupInvitationEmailMismatch')
          : code.includes('invitation')
            ? t('groupInvitationExpired')
            : t('groupOperationError'),
      )
    } finally {
      setIsResponding(false)
    }
  }

  const returnTo = `/invitation#token=${encodeURIComponent(token)}`
  const loginPath = `/login?returnTo=${encodeURIComponent(returnTo)}`
  const registerPath = `/register?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <section className="bg-[#f2f5ef] px-4 py-16">
      <PageContainer className="max-w-[620px] rounded-3xl border border-[#d7e0d7] bg-white p-6 shadow-[0_24px_70px_rgba(24,53,44,0.1)] sm:p-10">
        <p className="mb-2 text-xs font-bold tracking-[0.16em] text-[#285d43] uppercase">
          {t('brandName')}
        </p>
        <h1 className="m-0 font-display text-[clamp(30px,7vw,40px)] leading-tight font-medium tracking-[-0.04em] text-[#18352c]">
          {t('groupInvitationTitle')}
        </h1>

        {isLoading ? (
          <p aria-live="polite" className="mt-4 mb-0 text-sm text-[#52655a]">
            {t('authCheckingSession')}
          </p>
        ) : error && !preview ? (
          <p
            aria-live="assertive"
            className="mt-4 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
            role="alert"
          >
            {error}
          </p>
        ) : preview ? (
          <>
            <p className="mt-4 mb-0 text-sm leading-6 text-[#52655a]">
              {t('groupInvitationDescription').replace(
                '{group}',
                preview.groupName,
              )}
            </p>
            <div className="mt-5 rounded-2xl bg-[#f7faf6] p-4">
              <p className="m-0 text-xs font-semibold text-[#52655a]">
                {t('groupInvitationEmailHint')}
              </p>
              <p className="mt-1 mb-0 text-sm font-semibold text-[#243d32]">
                {preview.emailHint}
              </p>
              <p className="mt-3 mb-0 text-xs font-medium text-[#52655a]">
                {t('groupInvitationRecipientName')}
              </p>
              <p className="mt-1 mb-0 text-sm text-[#243d32]">
                {preview.displayName}
              </p>
              <p className="mt-3 mb-0 text-xs text-[#68796d]">
                {t('groupInvitationExpires').replace(
                  '{date}',
                  new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                  }).format(new Date(preview.expiresAt)),
                )}
              </p>
            </div>

            {error && (
              <p
                aria-live="assertive"
                className="mt-4 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
                role="alert"
              >
                {error}
              </p>
            )}

            {authLoading ? (
              <p aria-live="polite" className="mt-5 mb-0 text-sm text-[#52655a]">
                {t('authCheckingSession')}
              </p>
            ) : user ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#174b3a] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3026] disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
                  disabled={isResponding}
                  onClick={() => void handleRespond(true)}
                  type="button"
                >
                  {isResponding
                    ? t('groupInvitationResponding')
                    : t('groupInvitationAccept')}
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#cad7cc] px-4 text-sm font-semibold text-[#174b3a] transition hover:bg-[#edf3ed] disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
                  disabled={isResponding}
                  onClick={() => void handleRespond(false)}
                  type="button"
                >
                  {t('groupInvitationDecline')}
                </button>
              </div>
            ) : (
              <div className="mt-6">
                <p className="m-0 text-sm leading-6 text-[#52655a]">
                  {t('groupInvitationLoginPrompt')}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#174b3a] px-4 text-center text-sm font-semibold text-white no-underline transition hover:bg-[#0d3026]"
                    to={loginPath}
                  >
                    {t('groupInvitationLogin')}
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cad7cc] px-4 text-center text-sm font-semibold text-[#174b3a] no-underline transition hover:bg-[#edf3ed]"
                    to={registerPath}
                  >
                    {t('groupInvitationRegister')}
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : null}
      </PageContainer>
    </section>
  )
}
