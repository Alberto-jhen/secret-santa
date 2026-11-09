import type {
  GiftIdea,
  GroupActivity,
  GroupAssignment,
  GroupDrawResponse,
  GroupExclusion,
  GroupInvitation,
  GroupMember,
  GroupRecord,
  GroupSummary,
  InvitationPreview,
  Locale,
  MyGroupMembership,
} from '../models'
import { getSupabaseClient } from './supabase'

export interface CreateGroupInput {
  name: string
  eventDate: string | null
  minimumBudget: number | null
  maximumBudget: number | null
  locale: Locale
  exclusionsEnabled: boolean
}

export interface UpdateGroupInput extends CreateGroupInput {
  groupId: string
}

export interface GiftIdeaInput {
  title: string
  url: string | null
  note: string | null
}

function clientOrThrow() {
  const client = getSupabaseClient()
  if (!client) {
    throw new Error('service_not_configured')
  }
  return client
}

async function rpc<T>(
  functionName: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await clientOrThrow().rpc(
    functionName,
    parameters as never,
  )
  if (error) {
    throw error
  }
  return data as T
}

async function invoke<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await clientOrThrow().functions.invoke(functionName, {
    body,
  })
  if (error) {
    let code = 'request_failed'
    const context = error.context
    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as { error?: unknown }
        if (typeof payload.error === 'string') {
          code = payload.error
        }
      } catch {
        // Keep the generic code if the response body is not JSON.
      }
    }
    throw new Error(code)
  }
  return data as T
}

export function getMyGroups(): Promise<GroupSummary[]> {
  return rpc('get_my_groups')
}

export async function getGroup(groupId: string): Promise<GroupRecord> {
  const { data, error } = await clientOrThrow()
    .from('groups')
    .select(
      'id, name, state, minimum_budget, maximum_budget, currency, event_date, locale, exclusions_enabled, last_activity_at',
    )
    .eq('id', groupId)
    .maybeSingle()
  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('group_not_found')
  }
  return data as GroupRecord
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  return rpc('get_group_members', { p_group_id: groupId })
}

export async function getMyMembership(
  groupId: string,
): Promise<MyGroupMembership | null> {
  const memberships = await rpc<MyGroupMembership[]>(
    'get_my_group_membership',
    { p_group_id: groupId },
  )
  return memberships[0] ?? null
}

export function getGroupInvitations(
  groupId: string,
): Promise<GroupInvitation[]> {
  return rpc('get_group_invitations', { p_group_id: groupId })
}

export function getGroupExclusions(
  groupId: string,
): Promise<GroupExclusion[]> {
  return rpc('get_group_exclusions', { p_group_id: groupId })
}

export function getGroupActivity(groupId: string): Promise<GroupActivity[]> {
  return rpc('get_group_activity', { p_group_id: groupId, p_limit: 50 })
}

export async function getMyAssignment(
  groupId: string,
): Promise<GroupAssignment | null> {
  const assignments = await rpc<GroupAssignment[]>(
    'get_my_group_assignment',
    { p_group_id: groupId },
  )
  return assignments[0] ?? null
}

export function getGroupGiftIdeas(
  groupId: string,
  memberId: string,
): Promise<GiftIdea[]> {
  return rpc('get_group_gift_ideas', {
    p_group_id: groupId,
    p_member_id: memberId,
  })
}

export async function createGroup(input: CreateGroupInput): Promise<string> {
  return rpc('create_group', {
    p_name: input.name,
    p_event_date: input.eventDate,
    p_minimum_budget: input.minimumBudget,
    p_maximum_budget: input.maximumBudget,
    p_locale: input.locale,
    p_exclusions_enabled: input.exclusionsEnabled,
  })
}

export async function updateGroupSettings(input: UpdateGroupInput): Promise<void> {
  await rpc('update_group_settings', {
    p_group_id: input.groupId,
    p_name: input.name,
    p_event_date: input.eventDate,
    p_minimum_budget: input.minimumBudget,
    p_maximum_budget: input.maximumBudget,
    p_locale: input.locale,
    p_exclusions_enabled: input.exclusionsEnabled,
  })
}

export async function cancelGroup(groupId: string): Promise<void> {
  await rpc('cancel_group', { p_group_id: groupId })
}

export async function leaveGroup(groupId: string): Promise<void> {
  await rpc('leave_group', { p_group_id: groupId })
}

export async function removeGroupMember(
  groupId: string,
  memberId: string,
): Promise<void> {
  await rpc('remove_group_member', {
    p_group_id: groupId,
    p_member_id: memberId,
  })
}

export async function setGroupExclusion(
  groupId: string,
  giverMemberId: string | null,
  excludedMemberId: string | null,
): Promise<void> {
  await rpc('set_group_exclusion', {
    p_group_id: groupId,
    p_giver_member_id: giverMemberId,
    p_excluded_member_id: excludedMemberId,
  })
}

export async function cancelGroupDraw(groupId: string): Promise<void> {
  await rpc('cancel_group_draw', { p_group_id: groupId })
}

export function inviteGroupMember(input: {
  groupId: string
  email: string
  displayName: string
}): Promise<{ status: 'sent' | 'pending_delivery' }> {
  return invoke('group-invite', {
    action: 'invite',
    groupId: input.groupId,
    email: input.email,
    displayName: input.displayName,
  })
}

export function previewGroupInvitation(
  token: string,
): Promise<InvitationPreview> {
  return invoke('group-invite', { action: 'preview', token })
}

export function respondToGroupInvitation(
  token: string,
  accept: boolean,
): Promise<{ groupId: string }> {
  return invoke('group-invite', { action: 'respond', token, accept })
}

export function startGroupDraw(groupId: string): Promise<GroupDrawResponse> {
  return invoke('group-draw', { groupId })
}

export async function addGiftIdea(
  groupId: string,
  memberId: string,
  input: GiftIdeaInput,
): Promise<void> {
  const { error } = await clientOrThrow().from('gift_ideas').insert({
    group_id: groupId,
    member_id: memberId,
    title: input.title,
    url: input.url,
    note: input.note,
  })
  if (error) {
    throw error
  }
}

export async function updateGiftIdea(
  ideaId: string,
  input: GiftIdeaInput,
): Promise<void> {
  const { error } = await clientOrThrow()
    .from('gift_ideas')
    .update({
      title: input.title,
      url: input.url,
      note: input.note,
    })
    .eq('id', ideaId)
  if (error) {
    throw error
  }
}

export async function deleteGiftIdea(ideaId: string): Promise<void> {
  const { error } = await clientOrThrow()
    .from('gift_ideas')
    .delete()
    .eq('id', ideaId)
  if (error) {
    throw error
  }
}

export function subscribeGroupActivity(
  groupId: string,
  onActivity: () => void,
): () => void {
  const channel = clientOrThrow()
    .channel(`group-activity-${groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_activity',
        filter: `group_id=eq.${groupId}`,
      },
      onActivity,
    )
    .subscribe()

  return () => {
    void clientOrThrow().removeChannel(channel)
  }
}
