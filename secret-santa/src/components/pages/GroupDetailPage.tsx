import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type {
  GiftIdea,
  GroupActivity,
  GroupExclusion,
  GroupInvitation,
  GroupMember,
  GroupRecord,
  GroupAssignment,
  MyGroupMembership,
} from '../../models'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../i18n/useTranslation'
import { toSafeHttpUrl } from '../../lib/safeHttpUrl'
import {
  addGiftIdea,
  cancelGroup,
  cancelGroupDraw,
  deleteGiftIdea,
  getGroup,
  getGroupActivity,
  getGroupExclusions,
  getGroupGiftIdeas,
  getGroupInvitations,
  getGroupMembers,
  getMyAssignment,
  getMyMembership,
  inviteGroupMember,
  leaveGroup,
  removeGroupMember,
  setGroupExclusion,
  startGroupDraw,
  subscribeGroupActivity,
  updateGiftIdea,
  updateGroupSettings,
} from '../../lib/groupApi'
import { toast } from '../../lib/toast'
import { PageContainer } from '../ui/PageContainer'

function stateLabel(
  state: GroupRecord['state'],
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

function memberStateLabel(
  state: GroupMember['state'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (state) {
    case 'active':
      return t('groupMemberActive')
    case 'invited':
      return t('groupMemberInvited')
    case 'declined':
      return t('groupMemberDeclined')
    case 'left':
      return t('groupMemberLeft')
  }
}

function invitationStateLabel(
  state: GroupInvitation['state'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (state) {
    case 'pending':
      return t('groupInvitationStatePending')
    case 'accepted':
      return t('groupInvitationStateAccepted')
    case 'declined':
      return t('groupInvitationStateDeclined')
    case 'revoked':
      return t('groupInvitationStateRevoked')
    case 'expired':
      return t('groupInvitationStateExpired')
  }
}

function activityLabel(
  eventType: GroupActivity['event_type'],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (eventType) {
    case 'group_created':
      return t('groupActivityCreated')
    case 'group_updated':
      return t('groupActivityUpdated')
    case 'group_cancelled':
      return t('groupActivityCancelled')
    case 'member_invited':
      return t('groupActivityInvited')
    case 'member_accepted':
      return t('groupActivityAccepted')
    case 'member_declined':
      return t('groupActivityDeclined')
    case 'member_removed':
      return t('groupActivityRemoved')
    case 'member_left':
      return t('groupActivityLeft')
    case 'exclusion_updated':
      return t('groupActivityExclusion')
    case 'draw_completed':
      return t('groupActivityDraw')
    case 'draw_cancelled':
      return t('groupActivityDrawCancelled')
    case 'gift_idea_changed':
      return t('groupActivityGiftIdea')
    default:
      return eventType
  }
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

function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

export function GroupDetailPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { locale, t } = useTranslation()
  const userId = user?.id ?? ''
  const [group, setGroup] = useState<GroupRecord | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [membership, setMembership] = useState<MyGroupMembership | null>(null)
  const [invitations, setInvitations] = useState<GroupInvitation[]>([])
  const [exclusions, setExclusions] = useState<GroupExclusion[]>([])
  const [activity, setActivity] = useState<GroupActivity[]>([])
  const [assignment, setAssignment] = useState<GroupAssignment | null>(null)
  const [myIdeas, setMyIdeas] = useState<GiftIdea[]>([])
  const [recipientIdeas, setRecipientIdeas] = useState<GiftIdea[]>([])
  const [loadedGroupId, setLoadedGroupId] = useState('')
  const [loadedUserId, setLoadedUserId] = useState('')
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [minimumBudget, setMinimumBudget] = useState('')
  const [maximumBudget, setMaximumBudget] = useState('')
  const [groupLocale, setGroupLocale] = useState<'en' | 'es'>('es')
  const [exclusionsEnabled, setExclusionsEnabled] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [exclusionGiver, setExclusionGiver] = useState('')
  const [exclusionTarget, setExclusionTarget] = useState('')
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaUrl, setIdeaUrl] = useState('')
  const [ideaNote, setIdeaNote] = useState('')
  const [editingIdea, setEditingIdea] = useState<GiftIdea | null>(null)

  const loadGroupData = useCallback(async (isActive: () => boolean) => {
    if (!groupId) {
      return
    }
    try {
      const [groupRecord, memberRows, myMembership, activityRows, exclusionRows, myAssignment] =
        await Promise.all([
          getGroup(groupId),
          getGroupMembers(groupId),
          getMyMembership(groupId),
          getGroupActivity(groupId),
          getGroupExclusions(groupId),
          getMyAssignment(groupId),
        ])
      if (!myMembership) {
        throw new Error('membership_not_found')
      }
      const [invitationRows, ownIdeaRows, assignedIdeaRows] = await Promise.all([
        myMembership.role === 'organizer'
          ? getGroupInvitations(groupId)
          : Promise.resolve([] as GroupInvitation[]),
        getGroupGiftIdeas(groupId, myMembership.member_id),
        myAssignment
          ? getGroupGiftIdeas(groupId, myAssignment.assigned_member_id)
          : Promise.resolve([] as GiftIdea[]),
      ])
      if (!isActive()) {
        return
      }

      setGroup(groupRecord)
      setMembers(memberRows)
      setMembership(myMembership)
      setInvitations(invitationRows)
      setExclusions(exclusionRows)
      setActivity(activityRows)
      setAssignment(myAssignment)
      setMyIdeas(ownIdeaRows)
      setRecipientIdeas(assignedIdeaRows)
      setName(groupRecord.name)
      setEventDate(groupRecord.event_date ?? '')
      setMinimumBudget(
        groupRecord.minimum_budget === null
          ? ''
          : String(groupRecord.minimum_budget),
      )
      setMaximumBudget(
        groupRecord.maximum_budget === null
          ? ''
          : String(groupRecord.maximum_budget),
      )
      setGroupLocale(groupRecord.locale)
      setExclusionsEnabled(groupRecord.exclusions_enabled)
      setExclusionGiver('')
      const ownExclusion = exclusionRows.find(
        (exclusion) =>
          exclusion.giver_member_id === myMembership.member_id,
      )
      setExclusionTarget(ownExclusion?.excluded_member_id ?? '')
      setError('')
    } catch (loadError) {
      if (isActive()) {
        setGroup(null)
        setMembers([])
        setMembership(null)
        setInvitations([])
        setExclusions([])
        setActivity([])
        setAssignment(null)
        setMyIdeas([])
        setRecipientIdeas([])
        const code =
          loadError instanceof Error ? loadError.message : ''
        setError(
          code === 'group_not_found' || code === 'membership_not_found'
            ? t('groupNotFound')
            : t('groupLoadFailed'),
        )
      }
    } finally {
      if (isActive()) {
        setLoadedGroupId(groupId)
        setLoadedUserId(userId)
      }
    }
  }, [groupId, t, userId])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) {
        return loadGroupData(() => active)
      }
    })
    return () => {
      active = false
    }
  }, [loadGroupData, refreshKey])

  useEffect(() => {
    if (!groupId) {
      return
    }
    return subscribeGroupActivity(groupId, () => {
      setRefreshKey((current) => current + 1)
    })
  }, [groupId, userId])

  const activeMembers = useMemo(
    () => members.filter((member) => member.state === 'active'),
    [members],
  )
  const isOrganizer = membership?.role === 'organizer'
  const canManageGroup = isOrganizer && group?.state !== 'cancelled'
  const isGroupOpen = group?.state === 'setup' || group?.state === 'open'
  const isDrawn = group?.state === 'drawn'
  const isCancelled = group?.state === 'cancelled'
  const settingsLocked = !canManageGroup || !isGroupOpen
  const isLoading =
    loadedGroupId !== groupId || loadedUserId !== userId
  const dateLabel = formatDate(group?.event_date ?? null, locale)
  const budgetLabel = useMemo(() => {
    if (!group || (group.minimum_budget === null && group.maximum_budget === null)) {
      return null
    }
    if (group.minimum_budget !== null && group.maximum_budget !== null) {
      return `${formatMoney(group.minimum_budget, locale)}–${formatMoney(group.maximum_budget, locale)}`
    }
    return group.maximum_budget !== null
      ? `≤ ${formatMoney(group.maximum_budget, locale)}`
      : `≥ ${formatMoney(group.minimum_budget ?? 0, locale)}`
  }, [group, locale])

  async function runAction(
    action: string,
    operation: () => Promise<unknown>,
    successMessage?: string,
  ): Promise<boolean> {
    setBusyAction(action)
    setError('')
    try {
      await operation()
      if (successMessage) {
        toast.add({
          type: 'success',
          title: t('brandName'),
          description: successMessage,
        })
      }
      setRefreshKey((current) => current + 1)
      return true
    } catch {
      setError(t('groupOperationError'))
      toast.add({
        type: 'error',
        title: t('groupErrorTitle'),
        description: t('groupOperationError'),
        priority: 'high',
      })
      return false
    } finally {
      setBusyAction('')
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId) {
      return
    }
    const minimum =
      minimumBudget.trim() === '' ? null : Number(minimumBudget)
    const maximum =
      maximumBudget.trim() === '' ? null : Number(maximumBudget)
    if (
      (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
      (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) ||
      (minimum !== null && maximum !== null && minimum > maximum)
    ) {
      setError(t('groupOperationError'))
      return
    }

    await runAction(
      'settings',
      () =>
        updateGroupSettings({
          groupId,
          name: name.trim(),
          eventDate: eventDate || null,
          minimumBudget: minimum,
          maximumBudget: maximum,
          locale: groupLocale,
          exclusionsEnabled,
        }),
      t('groupUpdated'),
    )
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId) {
      return
    }
    setBusyAction('invite')
    setError('')
    try {
      const result = await inviteGroupMember({
        groupId,
        email: inviteEmail.trim(),
        displayName: inviteName.trim(),
      })
      toast.add({
        type: result.status === 'sent' ? 'success' : 'info',
        title: t('brandName'),
        description:
          result.status === 'sent'
            ? t('groupInviteSent')
            : t('groupInvitePending'),
      })
      setInviteEmail('')
      setInviteName('')
      setRefreshKey((current) => current + 1)
    } catch {
      setError(t('groupOperationError'))
    } finally {
      setBusyAction('')
    }
  }

  async function handleSaveExclusion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId || !membership) {
      return
    }
    const giverMemberId = isOrganizer
      ? exclusionGiver || membership.member_id
      : null
    await runAction(
      'exclusion',
      () =>
        setGroupExclusion(
          groupId,
          giverMemberId,
          exclusionTarget || null,
        ),
      t('groupExclusionSaved'),
    )
  }

  async function handleStartDraw() {
    if (!groupId || !window.confirm(t('groupDrawConfirm'))) {
      return
    }
    setBusyAction('draw')
    setError('')
    try {
      const result = await startGroupDraw(groupId)
      toast.add({
        type: result.emailStatus === 'sent' ? 'success' : 'info',
        title: t('brandName'),
        description:
          result.emailStatus === 'sent'
            ? t('groupDrawComplete')
            : t('groupDrawEmailPending'),
      })
      setRefreshKey((current) => current + 1)
    } catch (drawError) {
      const code =
        drawError instanceof Error ? drawError.message : 'group_draw_failed'
      setError(
        code === 'impossible_assignment'
          ? t('groupDrawImpossible')
          : code === 'invalid_group_member_count'
            ? t('groupDrawNeedsThree')
            : t('groupOperationError'),
      )
    } finally {
      setBusyAction('')
    }
  }

  async function handleCancelDraw() {
    if (
      !groupId ||
      !window.confirm(t('groupCancelDrawConfirm'))
    ) {
      return
    }
    await runAction(
      'cancel-draw',
      () => cancelGroupDraw(groupId),
      t('groupDrawCancelled'),
    )
  }

  async function handleCancelGroup() {
    if (
      !groupId ||
      !window.confirm(t('groupCancelConfirm'))
    ) {
      return
    }
    await runAction(
      'cancel-group',
      () => cancelGroup(groupId),
      t('groupCancelled'),
    )
  }

  async function handleLeaveGroup() {
    if (
      !groupId ||
      !window.confirm(t('groupLeaveConfirm'))
    ) {
      return
    }
    setBusyAction('leave')
    try {
      await leaveGroup(groupId)
      toast.add({
        type: 'success',
        title: t('brandName'),
        description: t('groupLeft'),
      })
      navigate('/groups', { replace: true })
    } catch {
      setError(t('groupOperationError'))
    } finally {
      setBusyAction('')
    }
  }

  async function handleRemoveMember(member: GroupMember) {
    if (
      !groupId ||
      !window.confirm(t('groupRemoveMemberConfirm'))
    ) {
      return
    }
    await runAction(
      `remove-${member.member_id}`,
      () => removeGroupMember(groupId, member.member_id),
    )
  }

  function startEditingIdea(idea: GiftIdea) {
    setEditingIdea(idea)
    setIdeaTitle(idea.title)
    setIdeaUrl(idea.url ?? '')
    setIdeaNote(idea.note ?? '')
  }

  function resetIdeaForm() {
    setEditingIdea(null)
    setIdeaTitle('')
    setIdeaUrl('')
    setIdeaNote('')
  }

  async function handleSaveIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupId || !membership || !ideaTitle.trim()) {
      return
    }
    const trimmedUrl = ideaUrl.trim()
    const safeUrl = toSafeHttpUrl(trimmedUrl)
    if (trimmedUrl && !safeUrl) {
      setError(t('groupGiftInvalidUrl'))
      return
    }
    const saved = await runAction(
      'gift-idea',
      () =>
        editingIdea
          ? updateGiftIdea(editingIdea.id, {
              title: ideaTitle.trim(),
              url: safeUrl,
              note: ideaNote.trim() || null,
            })
          : addGiftIdea(groupId, membership.member_id, {
              title: ideaTitle.trim(),
              url: safeUrl,
              note: ideaNote.trim() || null,
            }),
      editingIdea ? t('groupGiftUpdate') : t('groupGiftSave'),
    )
    if (saved) {
      resetIdeaForm()
    }
  }

  async function handleDeleteIdea(ideaId: string) {
    await runAction(
      `delete-idea-${ideaId}`,
      () => deleteGiftIdea(ideaId),
    )
  }

  const inputClassName =
    'min-h-10 w-full rounded-lg border border-[#cdd8ce] bg-white px-3 text-sm text-[#18352c] outline-none transition placeholder:text-[#879289] focus:border-[#1b674a] focus:ring-4 focus:ring-[#1b674a]/10 disabled:bg-[#f2f5ef] disabled:text-[#69786e]'
  const primaryButtonClass =
    'inline-flex min-h-10 items-center justify-center rounded-lg bg-[#174b3a] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3026] disabled:cursor-wait disabled:opacity-55'
  const secondaryButtonClass =
    'inline-flex min-h-9 items-center justify-center rounded-lg border border-[#cad7cc] bg-white px-3.5 text-xs font-semibold text-[#174b3a] transition hover:bg-[#edf3ed] disabled:cursor-wait disabled:opacity-55'

  if (isLoading) {
    return (
      <section className="grid min-h-[420px] place-items-center bg-[#f2f5ef] px-4 py-12">
        <p aria-live="polite" className="text-sm font-medium text-[#345246]">
          {t('authCheckingSession')}
        </p>
      </section>
    )
  }

  if (
    !group ||
    group.id !== groupId ||
    !membership ||
    error === t('groupNotFound')
  ) {
    return (
      <section className="bg-[#f2f5ef] px-4 py-12">
        <PageContainer className="max-w-[720px] rounded-2xl border border-[#d7e0d7] bg-white p-7">
          <p className="m-0 text-sm leading-6 text-[#52655a]">
            {error || t('groupNotFound')}
          </p>
          <Link
            className="mt-4 inline-flex font-semibold text-[#174b3a] underline underline-offset-4"
            to="/groups"
          >
            {t('groupBackToList')}
          </Link>
        </PageContainer>
      </section>
    )
  }

  const currentGiverId = exclusionGiver || membership.member_id

  return (
    <section className="bg-[#f2f5ef] px-4 py-8 sm:py-12">
      <PageContainer className="max-w-[1100px]">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#285d43] underline decoration-[#9db9a1] underline-offset-4"
          to="/groups"
        >
          {t('groupBackToList')}
        </Link>

        {error && error !== t('groupNotFound') && (
          <p
            aria-live="assertive"
            className="mt-5 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
            role="alert"
          >
            {error}
          </p>
        )}

        <header className="mt-5 rounded-3xl border border-[#d7e0d7] bg-white p-6 shadow-[0_14px_36px_rgba(24,53,44,0.07)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.16em] text-[#285d43] uppercase">
                {t('brandName')}
              </p>
              <h1 className="m-0 font-display text-[clamp(30px,7vw,44px)] leading-tight font-medium tracking-[-0.045em] text-[#18352c]">
                {group.name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#52655a]">
                <span>
                  {t('groupsMemberCount').replace(
                    '{count}',
                    String(activeMembers.length),
                  )}
                </span>
                {dateLabel && (
                  <span>
                    {t('groupEventDate')}: {dateLabel}
                  </span>
                )}
                {budgetLabel && <span>{budgetLabel}</span>}
              </div>
            </div>
            <span className="rounded-full bg-[#edf3ed] px-3.5 py-1.5 text-xs font-semibold text-[#285d43]">
              {stateLabel(group.state, t)}
            </span>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
          <div className="grid gap-6">
            {isOrganizer && (
              <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
                <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                  {t('groupSettings')}
                </h2>
                <form className="mt-4 grid gap-4" onSubmit={handleSaveSettings}>
                  <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                    {t('groupsName')}
                    <input
                      className={inputClassName}
                      disabled={settingsLocked}
                      maxLength={100}
                      onChange={(event) => setName(event.target.value)}
                      required
                      value={name}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                      {t('groupsEventDate')}
                      <input
                        className={inputClassName}
                        disabled={settingsLocked}
                        onChange={(event) => setEventDate(event.target.value)}
                        type="date"
                        value={eventDate}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                      {t('groupInvitationLanguage')}
                      <select
                        className={inputClassName}
                        disabled={settingsLocked}
                        onChange={(event) =>
                          setGroupLocale(event.target.value as 'en' | 'es')
                        }
                        value={groupLocale}
                      >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                      {t('groupsMinimumBudget')}
                      <input
                        className={inputClassName}
                        disabled={settingsLocked}
                        min="0"
                        onChange={(event) =>
                          setMinimumBudget(event.target.value)
                        }
                        step="0.01"
                        type="number"
                        value={minimumBudget}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                      {t('groupsMaximumBudget')}
                      <input
                        className={inputClassName}
                        disabled={settingsLocked}
                        min="0"
                        onChange={(event) =>
                          setMaximumBudget(event.target.value)
                        }
                        step="0.01"
                        type="number"
                        value={maximumBudget}
                      />
                    </label>
                  </div>
                  <label className="flex items-start gap-3 text-sm leading-5 text-[#40584a]">
                    <input
                      checked={exclusionsEnabled}
                      className="mt-0.5 size-4 accent-[#1b674a]"
                      disabled={settingsLocked}
                      onChange={(event) =>
                        setExclusionsEnabled(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>{t('groupsEnableExclusions')}</span>
                  </label>
                  <button
                    className={primaryButtonClass}
                    disabled={settingsLocked || busyAction !== ''}
                    type="submit"
                  >
                    {busyAction === 'settings'
                      ? t('groupUpdating')
                      : t('groupUpdate')}
                  </button>
                </form>
              </section>
            )}

            {isOrganizer && isGroupOpen && (
              <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
                <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                  {t('groupInvite')}
                </h2>
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleInvite}>
                  <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                    {t('groupInviteName')}
                    <input
                      autoComplete="name"
                      className={inputClassName}
                      maxLength={80}
                      onChange={(event) => setInviteName(event.target.value)}
                      required
                      value={inviteName}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                    {t('groupInviteEmail')}
                    <input
                      autoComplete="email"
                      className={inputClassName}
                      maxLength={254}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      required
                      type="email"
                      value={inviteEmail}
                    />
                  </label>
                  <button
                    className={`${primaryButtonClass} sm:col-span-2`}
                    disabled={busyAction !== ''}
                    type="submit"
                  >
                    {busyAction === 'invite' ? t('groupInviting') : t('groupInvite')}
                  </button>
                </form>
              </section>
            )}

            <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
              <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                {t('groupMembers')}
              </h2>
              <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                {members
                  .filter(
                    (member) =>
                      member.state !== 'left' || isOrganizer,
                  )
                  .map((member) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7faf6] px-4 py-3"
                      key={member.member_id}
                    >
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-semibold text-[#243d32]">
                          {member.display_name}
                          {member.role === 'organizer' && (
                            <span className="ml-2 text-xs font-medium text-[#627467]">
                              {t('groupMemberOrganizer')}
                            </span>
                          )}
                        </p>
                        <p className="m-0 mt-1 text-xs text-[#52655a]">
                          {memberStateLabel(member.state, t)}
                          {isOrganizer && member.email && (
                            <span> · {member.email}</span>
                          )}
                        </p>
                      </div>
                      {isOrganizer &&
                        member.member_id !== membership.member_id &&
                        (member.state === 'active' ||
                          member.state === 'invited') && (
                          <button
                            className={secondaryButtonClass}
                            disabled={busyAction !== ''}
                            onClick={() => void handleRemoveMember(member)}
                            type="button"
                          >
                            {member.state === 'invited'
                              ? t('groupInvitationRevoke')
                              : t('groupRemoveMember')}
                          </button>
                        )}
                    </li>
                  ))}
              </ul>
            </section>

            {isOrganizer && invitations.length > 0 && (
              <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
                <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                  {t('groupInvitations')}
                </h2>
                <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                  {invitations.map((invitation) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7faf6] px-4 py-3"
                      key={invitation.invitation_id}
                    >
                      <div className="min-w-0">
                        <p className="m-0 break-all text-sm font-semibold text-[#243d32]">
                          {invitation.email}
                        </p>
                        <p className="m-0 mt-1 text-xs text-[#52655a]">
                          {invitation.display_name} ·{' '}
                          {invitationStateLabel(invitation.state, t)}
                        </p>
                      </div>
                      <span className="rounded-full border border-[#d7e0d7] px-2.5 py-1 text-[11px] font-medium text-[#52655a]">
                        {invitation.delivery_state === 'sent'
                          ? t('groupInvitationDeliverySent')
                          : invitation.delivery_state === 'failed'
                            ? t('groupInvitationDeliveryFailed')
                            : t('groupInvitationDeliveryQueued')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                    {t('groupMyResult')}
                  </h2>
                  {assignment ? (
                    <p className="mt-3 mb-0 text-sm text-[#52655a]">
                      {t('groupAssignedTo')}
                    </p>
                  ) : (
                    <p className="mt-3 mb-0 text-sm leading-6 text-[#52655a]">
                      {t('groupNoResult')}
                    </p>
                  )}
                  {assignment && (
                    <p className="mt-1 mb-0 font-display text-2xl font-medium text-[#174b3a]">
                      {assignment.assigned_name}
                    </p>
                  )}
                </div>
                {isOrganizer && isGroupOpen && (
                  <button
                    className={primaryButtonClass}
                    disabled={busyAction !== '' || activeMembers.length < 3}
                    onClick={() => void handleStartDraw()}
                    type="button"
                  >
                    {busyAction === 'draw'
                      ? t('groupDrawing')
                      : t('groupDraw')}
                  </button>
                )}
                {isOrganizer && isDrawn && (
                  <button
                    className={secondaryButtonClass}
                    disabled={busyAction !== ''}
                    onClick={() => void handleCancelDraw()}
                    type="button"
                  >
                    {t('groupCancelDraw')}
                  </button>
                )}
              </div>
              {isOrganizer && isGroupOpen && activeMembers.length < 3 && (
                <p className="mt-4 mb-0 rounded-xl bg-[#f7faf6] p-3 text-xs leading-5 text-[#52655a]">
                  {t('groupDrawNeedsThree')}
                </p>
              )}
            </section>

            {group.exclusions_enabled && (
              <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
                <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                  {t('groupExclusionTitle')}
                </h2>
                {isGroupOpen ? (
                  <>
                    <form
                      className="mt-4 grid gap-3 sm:grid-cols-2"
                      onSubmit={handleSaveExclusion}
                    >
                      {isOrganizer && (
                        <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                          {t('groupExclusionMember')}
                          <select
                            className={inputClassName}
                            onChange={(event) => {
                              const giverId = event.target.value || membership.member_id
                              setExclusionGiver(event.target.value)
                              setExclusionTarget(
                                exclusions.find(
                                  (exclusion) =>
                                    exclusion.giver_member_id === giverId,
                                )?.excluded_member_id ?? '',
                              )
                            }}
                            value={exclusionGiver}
                          >
                            <option value="">{membership.display_name}</option>
                            {activeMembers
                              .filter(
                                (member) =>
                                  member.member_id !== membership.member_id,
                              )
                              .map((member) => (
                                <option
                                  key={member.member_id}
                                  value={member.member_id}
                                >
                                  {member.display_name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                        {t('groupExclusionSelect')}
                        <select
                          className={inputClassName}
                          onChange={(event) =>
                            setExclusionTarget(event.target.value)
                          }
                          value={exclusionTarget}
                        >
                          <option value="">{t('groupExclusionNone')}</option>
                          {activeMembers
                            .filter(
                              (member) =>
                                member.member_id !== currentGiverId,
                            )
                            .map((member) => (
                              <option
                                key={member.member_id}
                                value={member.member_id}
                              >
                                {member.display_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        className={`${primaryButtonClass} sm:col-span-2`}
                        disabled={busyAction !== ''}
                        type="submit"
                      >
                        {t('groupExclusionSave')}
                      </button>
                    </form>
                    {exclusions.length > 0 && (
                      <ul className="m-0 mt-4 grid list-none gap-1 p-0 text-xs text-[#52655a]">
                        {exclusions.map((exclusion) => {
                          const giver = members.find(
                            (member) =>
                              member.member_id === exclusion.giver_member_id,
                          )
                          const excluded = members.find(
                            (member) =>
                              member.member_id === exclusion.excluded_member_id,
                          )
                          return (
                            <li key={`${exclusion.giver_member_id}-${exclusion.excluded_member_id}`}>
                              {giver?.display_name ?? t('groupMemberParticipant')}
                              {' → '}
                              {excluded?.display_name ?? t('groupMemberParticipant')}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="mt-3 mb-0 text-sm leading-6 text-[#52655a]">
                    {t('groupExclusionsDisabled')}
                  </p>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
              <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                {t('groupGiftIdeas')}
              </h2>
              <h3 className="mt-4 mb-2 text-sm font-semibold text-[#285d43]">
                {t('groupGiftIdeasFor').replace(
                  '{name}',
                  membership.display_name,
                )}
              </h3>
              {myIdeas.length === 0 ? (
                <p className="m-0 text-sm text-[#52655a]">
                  {t('groupGiftEmpty')}
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {myIdeas.map((idea) => {
                    const safeUrl = toSafeHttpUrl(idea.url)
                    return (
                      <li
                        className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[#f7faf6] p-4"
                        key={idea.id}
                      >
                        <div className="min-w-0">
                          <p className="m-0 break-words text-sm font-semibold text-[#243d32]">
                            {idea.title}
                          </p>
                          {idea.url && (
                            safeUrl ? (
                              <a
                                className="mt-1 inline-block max-w-full break-all text-xs text-[#285d43] underline underline-offset-2"
                                href={safeUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                {idea.url}
                              </a>
                            ) : (
                              <p className="mt-1 mb-0 break-all text-xs text-[#52655a]">
                                {idea.url}
                              </p>
                            )
                          )}
                          {idea.note && (
                            <p className="mt-1 mb-0 whitespace-pre-wrap text-xs leading-5 text-[#52655a]">
                              {idea.note}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className={secondaryButtonClass}
                            disabled={busyAction !== '' || isCancelled}
                            onClick={() => startEditingIdea(idea)}
                            type="button"
                          >
                            {t('groupGiftEdit')}
                          </button>
                          <button
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#e7c8c0] bg-white px-3.5 text-xs font-semibold text-[#8b392e] transition hover:bg-[#fff5f1] disabled:opacity-55"
                            disabled={busyAction !== '' || isCancelled}
                            onClick={() => void handleDeleteIdea(idea.id)}
                            type="button"
                          >
                            {t('groupGiftDelete')}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!isCancelled && (
                <form className="mt-4 grid gap-3" onSubmit={handleSaveIdea}>
                  <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                    {t('groupGiftTitle')}
                    <input
                      className={inputClassName}
                      maxLength={160}
                      onChange={(event) => setIdeaTitle(event.target.value)}
                      placeholder={t('groupGiftTitlePlaceholder')}
                      required
                      value={ideaTitle}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                    {t('groupGiftUrl')}
                    <input
                      className={inputClassName}
                      maxLength={2048}
                      onChange={(event) => setIdeaUrl(event.target.value)}
                      placeholder="https://"
                      type="url"
                      value={ideaUrl}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-[#243d32]">
                    {t('groupGiftNote')}
                    <textarea
                      className={`${inputClassName} min-h-20 py-2.5`}
                      maxLength={1000}
                      onChange={(event) => setIdeaNote(event.target.value)}
                      value={ideaNote}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={primaryButtonClass}
                      disabled={busyAction !== ''}
                      type="submit"
                    >
                      {editingIdea ? t('groupGiftUpdate') : t('groupGiftSave')}
                    </button>
                    {editingIdea && (
                      <button
                        className={secondaryButtonClass}
                        onClick={resetIdeaForm}
                        type="button"
                      >
                        {t('groupGiftCancelEdit')}
                      </button>
                    )}
                  </div>
                </form>
              )}
              {assignment && (
                <div className="mt-6 border-t border-[#e5ebe5] pt-5">
                  <h3 className="m-0 text-sm font-semibold text-[#285d43]">
                    {t('groupGiftIdeasFor').replace(
                      '{name}',
                      assignment.assigned_name,
                    )}
                  </h3>
                  {recipientIdeas.length === 0 ? (
                    <p className="mt-2 mb-0 text-sm text-[#52655a]">
                      {t('groupGiftEmpty')}
                    </p>
                  ) : (
                    <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                      {recipientIdeas.map((idea) => {
                        const safeUrl = toSafeHttpUrl(idea.url)
                        return (
                          <li
                            className="rounded-xl bg-[#f7faf6] p-4"
                            key={idea.id}
                          >
                            <p className="m-0 break-words text-sm font-semibold text-[#243d32]">
                              {idea.title}
                            </p>
                            {idea.url && (
                              safeUrl ? (
                                <a
                                  className="mt-1 inline-block max-w-full break-all text-xs text-[#285d43] underline underline-offset-2"
                                  href={safeUrl}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  {idea.url}
                                </a>
                              ) : (
                                <p className="mt-1 mb-0 break-all text-xs text-[#52655a]">
                                  {idea.url}
                                </p>
                              )
                            )}
                            {idea.note && (
                              <p className="mt-1 mb-0 whitespace-pre-wrap text-xs leading-5 text-[#52655a]">
                                {idea.note}
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)] sm:p-6">
              <h2 className="m-0 text-lg font-semibold text-[#18352c]">
                {t('groupActivity')}
              </h2>
              {activity.length === 0 ? (
                <p className="mt-3 mb-0 text-sm text-[#52655a]">
                  {t('groupActivityCreated')}
                </p>
              ) : (
                <ol className="m-0 mt-4 grid list-none gap-3 border-l border-[#d7e0d7] pl-4">
                  {activity.map((entry) => (
                    <li className="relative" key={entry.activity_id}>
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-white bg-[#5f9269] ring-1 ring-[#9db9a1]"
                      />
                      <p className="m-0 text-sm leading-5 text-[#344d40]">
                        <span className="font-semibold">
                          {entry.actor_display_name}
                        </span>{' '}
                        {activityLabel(entry.event_type, t)}
                      </p>
                      <time
                        className="mt-1 block text-[11px] text-[#68796d]"
                        dateTime={entry.created_at}
                      >
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(entry.created_at))}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <aside className="grid gap-4">
            {isOrganizer && isGroupOpen && (
              <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)]">
                <h2 className="m-0 text-sm font-semibold text-[#18352c]">
                  {t('groupCancel')}
                </h2>
                <p className="mt-2 mb-4 text-xs leading-5 text-[#52655a]">
                  {t('groupCancelConfirm')}
                </p>
                <button
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#e7c8c0] bg-white px-3.5 text-xs font-semibold text-[#8b392e] transition hover:bg-[#fff5f1] disabled:opacity-55"
                  disabled={busyAction !== ''}
                  onClick={() => void handleCancelGroup()}
                  type="button"
                >
                  {t('groupCancel')}
                </button>
              </section>
            )}
            {!isOrganizer && isGroupOpen && (
              <section className="rounded-2xl border border-[#d7e0d7] bg-white p-5 shadow-[0_10px_28px_rgba(24,53,44,0.05)]">
                <h2 className="m-0 text-sm font-semibold text-[#18352c]">
                  {t('groupLeave')}
                </h2>
                <button
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg border border-[#e7c8c0] bg-white px-3.5 text-xs font-semibold text-[#8b392e] transition hover:bg-[#fff5f1] disabled:opacity-55"
                  disabled={busyAction !== ''}
                  onClick={() => void handleLeaveGroup()}
                  type="button"
                >
                  {t('groupLeave')}
                </button>
              </section>
            )}
          </aside>
        </div>
      </PageContainer>
    </section>
  )
}
