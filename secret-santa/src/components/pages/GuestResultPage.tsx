import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GuestResult } from '../../models'
import { useTranslation } from '../../i18n/useTranslation'
import { GuestDrawApiError, invokeGuestFunction } from '../../lib/guestDrawApi'
import { Icon } from '../ui/Icon'
import { PageContainer } from '../ui/PageContainer'

type LoadState = 'loading' | 'ready' | 'missing' | 'not_found' | 'failed'
type ResendState = 'idle' | 'sending' | 'sent' | 'failed'

function readAccessToken(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
}

export function GuestResultPage() {
  const { t } = useTranslation()
  const [token] = useState(readAccessToken)
  const [loadState, setLoadState] = useState<LoadState>(
    token ? 'loading' : 'missing',
  )
  const [result, setResult] = useState<GuestResult | null>(null)
  const [resendState, setResendState] = useState<ResendState>('idle')

  useEffect(() => {
    if (!token) {
      return
    }

    const controller = new AbortController()
    let isCurrent = true

    invokeGuestFunction<GuestResult>(
      'guest-result',
      { token },
      controller.signal,
    )
      .then((assignment) => {
        if (isCurrent) {
          setResult(assignment)
          setLoadState('ready')
        }
      })
      .catch((error: unknown) => {
        if (!isCurrent) {
          return
        }

        if (error instanceof GuestDrawApiError && error.status === 404) {
          setLoadState('not_found')
        } else {
          setLoadState('failed')
        }
      })

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [token])

  async function resendResult() {
    setResendState('sending')

    try {
      await invokeGuestFunction('guest-resend', { token })
      setResendState('sent')
    } catch {
      setResendState('failed')
    }
  }

  const eventDateLabel =
    result?.eventDate &&
    new Date(`${result.eventDate}T00:00:00.000Z`).toLocaleDateString(
      result.locale === 'es' ? 'es-ES' : 'en',
    )

  return (
    <section className="relative isolate min-h-[650px] overflow-hidden bg-canvas py-12 max-[720px]:py-[26px]">
      <span
        aria-hidden="true"
        className="absolute top-[-190px] left-[12%] size-[380px] rounded-full bg-lime/20 blur-3xl"
      />
      <PageContainer className="relative max-w-[700px]">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-[11px] text-forest no-underline hover:underline hover:underline-offset-4"
          to="/"
        >
          <Icon className="size-[15px]" name="arrow-left" />
          {t('guestResultBack')}
        </Link>

        <div className="rounded-[18px] border border-line bg-paper px-8 py-10 text-center shadow-[0_22px_55px_rgba(24,53,44,0.07)] max-[720px]:px-5">
          <span className="mx-auto mb-5 grid size-12 place-items-center rounded-[15px] bg-lime text-forest">
            <Icon className="size-6" name="gift" />
          </span>
          <p className="mb-2 text-[10px] font-bold tracking-[0.15em] text-forest uppercase">
            {t('guestResultTitle')}
          </p>
          <h1 className="m-0 font-display text-[clamp(34px,7vw,50px)] leading-[1.1] font-medium tracking-[-0.045em] text-ink">
            {loadState === 'ready' && result
              ? result.displayName
              : t('guestResultTitle')}
          </h1>

          {loadState === 'loading' && (
            <p className="mt-5 text-sm text-muted-foreground" role="status">
              {t('guestResultLoading')}
            </p>
          )}

          {loadState === 'missing' && (
            <p className="mt-5 text-sm leading-[1.7] text-muted-foreground" role="alert">
              {t('guestResultMissingToken')}
            </p>
          )}

          {loadState === 'not_found' && (
            <p className="mt-5 text-sm leading-[1.7] text-muted-foreground" role="alert">
              {t('guestResultNotFound')}
            </p>
          )}

          {loadState === 'failed' && (
            <p className="mt-5 text-sm leading-[1.7] text-muted-foreground" role="alert">
              {t('guestResultLoadFailed')}
            </p>
          )}

          {loadState === 'ready' && result && (
            <div className="mt-6">
              <p className="mb-2 text-sm text-muted-foreground">
                {t('guestResultIntro')}
              </p>
              <p
                className="m-0 rounded-xl bg-[#f1f5e9] px-5 py-6 font-display text-[clamp(30px,6vw,42px)] font-medium text-forest"
                data-testid="guest-assigned-name"
              >
                {result.assignedName}
              </p>
              {eventDateLabel && (
                <p className="mt-4 text-xs text-muted-foreground">
                  {t('guestResultEventDate')}: {eventDateLabel}
                </p>
              )}

              <button
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d8e0d3] px-5 text-xs font-semibold text-forest transition hover:bg-[#eff4e7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:cursor-wait disabled:opacity-60"
                disabled={resendState === 'sending'}
                onClick={resendResult}
                type="button"
              >
                {resendState === 'sending'
                  ? t('guestResultResending')
                  : t('guestResultResend')}
              </button>
              {resendState === 'sent' && (
                <p className="mt-3 text-xs text-forest" role="status">
                  {t('guestResultResent')}
                </p>
              )}
              {resendState === 'failed' && (
                <p className="mt-3 text-xs text-[#8a4b41]" role="alert">
                  {t('guestResultResendFailed')}
                </p>
              )}
            </div>
          )}
        </div>
      </PageContainer>
    </section>
  )
}
