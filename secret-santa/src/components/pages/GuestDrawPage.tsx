import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type {
  GuestDrawResponse,
  GuestParticipantInput,
  Locale,
} from '../../models'
import type { TranslationKey } from '../../i18n/translations'
import { useTranslation } from '../../i18n/useTranslation'
import { GuestDrawApiError, invokeGuestFunction } from '../../lib/guestDrawApi'
import { Icon } from '../ui/Icon'
import { PageContainer } from '../ui/PageContainer'

type SubmissionState = 'idle' | 'submitting' | 'pending' | 'retry' | 'sent'

function newParticipant(): GuestParticipantInput {
  return {
    clientId: crypto.randomUUID(),
    displayName: '',
    email: '',
    excludedClientIds: [],
  }
}

function errorTranslationKey(error: unknown): TranslationKey {
  if (!(error instanceof GuestDrawApiError)) {
    return 'guestDrawErrorRetry'
  }

  if (error.code === 'backend_not_configured') {
    return 'guestDrawErrorBackend'
  }

  if (error.code === 'duplicate_participant') {
    return 'guestDrawErrorDuplicate'
  }

  if (error.code === 'impossible_assignment') {
    return 'guestDrawErrorImpossible'
  }

  if (error.code === 'daily_email_limit') {
    return 'guestDrawErrorDailyLimit'
  }

  if (error.code === 'rate_limit_exceeded') {
    return 'guestDrawErrorRateLimit'
  }

  if (error.code.startsWith('invalid_')) {
    return 'guestDrawErrorInvalid'
  }

  return error.status >= 500 || error.status === 0
    ? 'guestDrawErrorRetry'
    : 'guestDrawErrorGeneric'
}

export function GuestDrawPage() {
  const { t, locale } = useTranslation()
  const [participants, setParticipants] = useState<GuestParticipantInput[]>(() => [
    newParticipant(),
    newParticipant(),
  ])
  const [eventDate, setEventDate] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [requestLocale, setRequestLocale] = useState<Locale | null>(null)
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)

  const isLocked =
    submissionState === 'submitting' ||
    submissionState === 'pending' ||
    submissionState === 'retry' ||
    submissionState === 'sent'
  const inputClassName =
    'min-h-11 w-full rounded-lg border border-[#dfe4da] bg-white px-3 text-xs text-ink outline-none transition placeholder:text-[#a2aba3] focus:border-[#7da18d] focus:ring-4 focus:ring-forest/10 disabled:bg-[#f1f2ed] disabled:text-[#879289]'

  function updateParticipant(
    clientId: string,
    field: 'displayName' | 'email',
    value: string,
  ) {
    setParticipants((current) =>
      current.map((participant) =>
        participant.clientId === clientId
          ? { ...participant, [field]: value }
          : participant,
      ),
    )
  }
  function removeParticipant(clientId: string) {
    setParticipants((current) => {
      const remaining = current.filter(
        (participant) => participant.clientId !== clientId,
      )

      return remaining.map((participant) => ({
        ...participant,
        excludedClientIds:
          remaining.length <= 2
            ? []
            : participant.excludedClientIds.filter((id) => id !== clientId),
      }))
    })
  }

  function toggleExclusion(giverId: string, excludedId: string) {
    setParticipants((current) =>
      current.map((participant) => {
        if (participant.clientId !== giverId) {
          return participant
        }

        const isExcluded = participant.excludedClientIds.includes(excludedId)

        return {
          ...participant,
          excludedClientIds: isExcluded
            ? participant.excludedClientIds.filter((id) => id !== excludedId)
            : [...participant.excludedClientIds, excludedId],
        }
      }),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorKey(null)
    setSubmissionState('submitting')
    const localeForRequest = requestLocale ?? locale
    setRequestLocale(localeForRequest)

    try {
      const result = await invokeGuestFunction<GuestDrawResponse>('guest-draw', {
        requestId,
        eventDate: eventDate || null,
        locale: localeForRequest,
        participants,
      })

      if (result.status === 'pending_delivery' || result.pendingCount > 0) {
        setPendingCount(result.pendingCount)
        setSubmissionState('pending')
        return
      }

      setSubmissionState('sent')
      setParticipants([newParticipant(), newParticipant()])
    } catch (error) {
      setErrorKey(errorTranslationKey(error))

      if (
        error instanceof GuestDrawApiError &&
        error.status > 0 &&
        error.status < 500
      ) {
        setSubmissionState('idle')
      } else {
        setSubmissionState('retry')
      }
    }
  }

  function startOver() {
    setParticipants([newParticipant(), newParticipant()])
    setEventDate('')
    setRequestId(crypto.randomUUID())
    setRequestLocale(null)
    setPendingCount(0)
    setErrorKey(null)
    setSubmissionState('idle')
  }

  return (
    <section className="relative isolate min-h-[720px] overflow-hidden bg-canvas py-12 max-[720px]:py-[26px]">
      <span
        aria-hidden="true"
        className="absolute top-[-190px] right-[8%] size-[380px] rounded-full bg-lime/20 blur-3xl"
      />
      <PageContainer className="relative max-w-[850px]">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-[11px] text-forest no-underline hover:underline hover:underline-offset-4"
          to="/"
        >
          <Icon className="size-[15px]" name="arrow-left" />
          {t('guestDrawBack')}
        </Link>

        <div className="rounded-[18px] border border-line bg-paper px-8 py-8 shadow-[0_22px_55px_rgba(24,53,44,0.07)] max-[720px]:px-5 max-[420px]:px-4">
          <div className="mb-7 max-w-[620px]">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.15em] text-forest uppercase">
              <Icon className="size-4" name="gift" />
              {t('guestDrawParticipants')}
            </p>
            <h1 className="m-0 font-display text-[clamp(36px,6vw,52px)] leading-[1.05] font-medium tracking-[-0.045em] text-ink">
              {t('guestDrawTitle')}
            </h1>
            <p className="mt-3 text-sm leading-[1.75] text-muted-foreground">
              {t('guestDrawDescription')}
            </p>
          </div>

          {submissionState === 'sent' ? (
            <div
              aria-live="polite"
              className="rounded-xl border border-[#cbd9c0] bg-[#f2f6e9] p-5 text-sm leading-[1.7] text-forest-dark"
              role="status"
            >
              <p className="m-0">{t('guestDrawSuccess')}</p>
              <button
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-xs font-semibold text-paper transition hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                onClick={startOver}
                type="button"
              >
                {t('guestDrawStartOver')}
                <Icon className="size-4" name="arrow-right" />
              </button>
            </div>
          ) : (
            <form className="grid gap-6" onSubmit={handleSubmit}>
              <div className="grid max-w-[330px] gap-2">
                <label
                  className="text-[11px] font-semibold text-[#344d40]"
                  htmlFor="event-date"
                >
                  {t('guestDrawEventDate')}
                </label>
                <input
                  className={inputClassName}
                  disabled={isLocked}
                  id="event-date"
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setEventDate(event.target.value)}
                  type="date"
                  value={eventDate}
                />
                <p className="m-0 text-[10px] leading-[1.6] text-muted-foreground">
                  {t('guestDrawEventDateHelp')}
                </p>
              </div>

              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                  <h2 className="m-0 font-display text-2xl font-medium text-ink">
                    {t('guestDrawParticipants')} ({participants.length}/50)
                  </h2>
                  {participants.length < 50 && (
                    <button
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#d8e0d3] px-4 text-[11px] font-semibold text-forest transition hover:bg-[#eff4e7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-50"
                      disabled={isLocked}
                      onClick={() =>
                        setParticipants((current) => [
                          ...current,
                          newParticipant(),
                        ])
                      }
                      type="button"
                    >
                      <span aria-hidden="true" className="text-base leading-none">
                        +
                      </span>
                      {t('guestDrawAddParticipant')}
                    </button>
                  )}
                </div>

                {participants.map((participant, index) => (
                  <fieldset
                    className="grid gap-4 rounded-xl border border-[#e2e7de] bg-[#fbfcf8] p-4 max-[420px]:p-3"
                    key={participant.clientId}
                  >
                    <legend className="px-1 font-display text-lg font-medium text-ink">
                      {t('guestDrawParticipant')} {index + 1}
                    </legend>
                    {participants.length > 2 && (
                      <div className="flex justify-end">
                        <button
                          aria-label={`${t('guestDrawRemoveParticipant')} ${index + 1}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-[#8a4b41] hover:bg-[#f8eae5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-50"
                          disabled={isLocked}
                          onClick={() => removeParticipant(participant.clientId)}
                          type="button"
                        >
                          <span aria-hidden="true" className="text-sm">
                            ×
                          </span>
                          {t('guestDrawRemoveParticipant')}
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
                      <label className="grid gap-1.5 text-[10px] font-semibold text-[#344d40]">
                        {t('fieldName')}
                        <input
                          autoComplete="name"
                          className={inputClassName}
                          disabled={isLocked}
                          maxLength={80}
                          onChange={(event) =>
                            updateParticipant(
                              participant.clientId,
                              'displayName',
                              event.target.value,
                            )
                          }
                          placeholder={t('guestDrawNamePlaceholder')}
                          required
                          value={participant.displayName}
                        />
                      </label>
                      <label className="grid gap-1.5 text-[10px] font-semibold text-[#344d40]">
                        {t('fieldEmail')}
                        <input
                          autoComplete="email"
                          className={inputClassName}
                          disabled={isLocked}
                          maxLength={254}
                          onChange={(event) =>
                            updateParticipant(
                              participant.clientId,
                              'email',
                              event.target.value,
                            )
                          }
                          placeholder={t('guestDrawEmailPlaceholder')}
                          required
                          type="email"
                          value={participant.email}
                        />
                      </label>
                    </div>

                    {participants.length > 2 && (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold text-[#344d40]">
                          {t('guestDrawExclusions')}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {participants
                            .filter(
                              ({ clientId }) =>
                                clientId !== participant.clientId,
                            )
                            .map((other, otherIndex) => (
                              <label
                                className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
                                key={other.clientId}
                              >
                                <input
                                  checked={participant.excludedClientIds.includes(
                                    other.clientId,
                                  )}
                                  className="size-3.5 accent-forest"
                                  disabled={isLocked}
                                  onChange={() =>
                                    toggleExclusion(
                                      participant.clientId,
                                      other.clientId,
                                    )
                                  }
                                  type="checkbox"
                                />
                                {other.displayName ||
                                  `${t('guestDrawParticipant')} ${otherIndex + 1}`}
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                  </fieldset>
                ))}
              </div>

              <label className="flex items-start gap-2 text-[10px] leading-[1.6] text-[#68766d]">
                <input
                  className="mt-0.5 size-3.5 shrink-0 accent-forest"
                  disabled={isLocked}
                  required
                  type="checkbox"
                />
                <span>{t('guestDrawConsent')}</span>
              </label>

              {submissionState === 'pending' && (
                <p
                  aria-live="polite"
                  className="m-0 rounded-lg border border-[#ead9a4] bg-[#fff9e9] p-3 text-xs leading-[1.7] text-[#705b25]"
                  role="status"
                >
                  {t('guestDrawPending')} ({pendingCount}{' '}
                  {t('guestDrawPendingEmailCount')})
                </p>
              )}

              {errorKey && (
                <p
                  aria-live="assertive"
                  className="m-0 rounded-lg border border-[#eccac1] bg-[#fff4f0] p-3 text-xs leading-[1.7] text-[#8a4b41]"
                  role="alert"
                >
                  {t(errorKey)}
                </p>
              )}

              <div className="grid gap-4 border-t border-line pt-4">
                <p className="m-0 text-[10px] leading-[1.7] text-muted-foreground">
                  {t('guestDrawPrivacy')}
                </p>
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-forest px-6 text-[13px] font-semibold text-paper shadow-[0_7px_18px_rgba(23,75,58,0.14)] transition hover:-translate-y-0.5 hover:bg-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:cursor-wait disabled:opacity-70"
                  disabled={submissionState === 'submitting'}
                  type="submit"
                >
                  {submissionState === 'submitting'
                    ? t('guestDrawSubmitting')
                    : submissionState === 'pending' ||
                        submissionState === 'retry'
                      ? t('guestDrawRetry')
                      : t('guestDrawSubmit')}
                  {submissionState !== 'submitting' && (
                    <Icon className="size-[17px]" name="arrow-right" />
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </PageContainer>
    </section>
  )
}
