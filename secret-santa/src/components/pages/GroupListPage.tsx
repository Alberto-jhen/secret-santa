import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GroupSummary } from '../../models'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../i18n/useTranslation'
import { createGroup, getMyGroups } from '../../lib/groupApi'
import { toast } from '../../lib/toast'
import { PageContainer } from '../ui/PageContainer'

function groupStateLabel(
  state: GroupSummary['state'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (state) {
    case 'setup':
      return t('groupsStateSetup')
    case 'open':
      return t('groupsStateOpen')
    case 'drawn':
      return t('groupsStateDrawn')
    case 'cancelled':
      return t('groupsStateCancelled')
  }
}

function formatBudget(
  group: GroupSummary,
  locale: string,
): string | null {
  if (group.minimum_budget === null && group.maximum_budget === null) {
    return null
  }
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: group.currency,
    maximumFractionDigits: 0,
  })
  if (group.minimum_budget !== null && group.maximum_budget !== null) {
    return `${formatter.format(group.minimum_budget)}–${formatter.format(group.maximum_budget)}`
  }
  if (group.maximum_budget !== null) {
    return `≤ ${formatter.format(group.maximum_budget)}`
  }
  return `≥ ${formatter.format(group.minimum_budget ?? 0)}`
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) {
    return null
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export function GroupListPage() {
  const { user } = useAuth()
  const { locale, t } = useTranslation()
  const navigate = useNavigate()
  const userId = user?.id ?? ''
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadedUserId, setLoadedUserId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [minimumBudget, setMinimumBudget] = useState('')
  const [maximumBudget, setMaximumBudget] = useState('')
  const [exclusionsEnabled, setExclusionsEnabled] = useState(false)

  useEffect(() => {
    let active = true
    getMyGroups()
      .then((data) => {
        if (active) {
          setGroups(data)
          setError('')
        }
      })
      .catch(() => {
        if (active) {
          setGroups([])
          setError(t('groupsLoadFailed'))
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
          setLoadedUserId(userId)
        }
      })

    return () => {
      active = false
    }
  }, [t, userId])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsCreating(true)

    try {
      const groupId = await createGroup({
        name: name.trim(),
        eventDate: eventDate || null,
        minimumBudget: minimumBudget === '' ? null : Number(minimumBudget),
        maximumBudget: maximumBudget === '' ? null : Number(maximumBudget),
        locale,
        exclusionsEnabled,
      })
      navigate(`/groups/${groupId}`)
    } catch {
      setError(t('groupOperationError'))
      toast.add({
        type: 'error',
        title: t('groupErrorTitle'),
        description: t('groupOperationError'),
        priority: 'high',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const inputClassName =
    'min-h-11 w-full rounded-xl border border-[#cdd8ce] bg-white px-3.5 text-sm text-[#18352c] outline-none transition placeholder:text-[#879289] focus:border-[#1b674a] focus:ring-4 focus:ring-[#1b674a]/10'
  const showGroupsLoading = isLoading || loadedUserId !== userId

  return (
    <section className="bg-[#f2f5ef] px-4 py-10 sm:py-14">
      <PageContainer className="max-w-[1040px]">
        <header className="mb-8">
          <p className="mb-2 text-xs font-bold tracking-[0.16em] text-[#285d43] uppercase">
            Remigo
          </p>
          <h1 className="m-0 font-display text-[clamp(32px,7vw,48px)] leading-tight font-medium tracking-[-0.045em] text-[#18352c]">
            {t('groupsTitle')}
          </h1>
          <p className="mt-3 max-w-[640px] text-sm leading-6 text-[#52655a]">
            {t('groupsDescription')}
          </p>
        </header>

        {error && (
          <p
            aria-live="assertive"
            className="mb-6 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
          <section
            aria-labelledby="group-list-title"
            className="grid gap-4"
          >
            <h2
              className="m-0 text-lg font-semibold text-[#18352c]"
              id="group-list-title"
            >
              {t('groupsTitle')}
            </h2>
            {showGroupsLoading ? (
              <p aria-live="polite" className="m-0 text-sm text-[#52655a]">
                {t('authCheckingSession')}
              </p>
            ) : groups.length === 0 ? (
              <p className="m-0 rounded-2xl border border-dashed border-[#bdcdbf] bg-white/70 p-6 text-sm leading-6 text-[#52655a]">
                {t('groupsEmpty')}
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0">
                {groups.map((group) => {
                  const budget = formatBudget(group, locale)
                  const date = formatDate(group.event_date, locale)
                  return (
                    <li key={group.group_id}>
                      <Link
                        className="block rounded-2xl border border-[#d7e0d7] bg-white p-5 no-underline shadow-[0_8px_22px_rgba(24,53,44,0.04)] transition hover:-translate-y-0.5 hover:border-[#9db9a1] hover:shadow-[0_14px_30px_rgba(24,53,44,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#285d43]"
                        to={`/groups/${group.group_id}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="m-0 text-lg font-semibold text-[#18352c]">
                            {group.name}
                          </h3>
                          <span className="rounded-full bg-[#edf3ed] px-3 py-1 text-xs font-semibold text-[#285d43]">
                            {groupStateLabel(group.state, t)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#52655a]">
                          <span>
                            {t('groupsMemberCount').replace(
                              '{count}',
                              String(group.active_member_count),
                            )}
                          </span>
                          {date && <span>{date}</span>}
                          <span>{budget ?? t('groupsNoBudget')}</span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_14px_36px_rgba(24,53,44,0.07)] sm:p-6">
            <h2 className="m-0 text-lg font-semibold text-[#18352c]">
              {t('groupsNew')}
            </h2>
            <form className="mt-5 grid gap-4" onSubmit={handleCreate}>
              <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                {t('groupsName')}
                <input
                  className={inputClassName}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('groupsNamePlaceholder')}
                  required
                  value={name}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                {t('groupsEventDate')}
                <input
                  className={inputClassName}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setEventDate(event.target.value)}
                  type="date"
                  value={eventDate}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                  {t('groupsMinimumBudget')}
                  <input
                    className={inputClassName}
                    min="0"
                    onChange={(event) => setMinimumBudget(event.target.value)}
                    step="1"
                    type="number"
                    value={minimumBudget}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                  {t('groupsMaximumBudget')}
                  <input
                    className={inputClassName}
                    min="0"
                    onChange={(event) => setMaximumBudget(event.target.value)}
                    step="1"
                    type="number"
                    value={maximumBudget}
                  />
                </label>
              </div>
              <label className="flex items-start gap-3 text-sm leading-5 text-[#40584a]">
                <input
                  checked={exclusionsEnabled}
                  className="mt-0.5 size-4 accent-[#1b674a]"
                  onChange={(event) =>
                    setExclusionsEnabled(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>{t('groupsEnableExclusions')}</span>
              </label>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#174b3a] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3026] disabled:cursor-wait disabled:opacity-60"
                disabled={isCreating}
                type="submit"
              >
                {isCreating ? t('groupsCreating') : t('groupsCreate')}
              </button>
            </form>
          </section>
        </div>
      </PageContainer>
    </section>
  )
}
