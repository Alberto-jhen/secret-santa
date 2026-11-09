import {
  assignRecipients,
  DrawConstraintError,
  isValidGroupMemberCount,
} from '../_shared/assignment.ts'
import type { GroupDrawResponse } from '../../../src/models.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { processGroupEmailOutbox } from '../_shared/groupEmail.ts'
import { HttpError, readJsonObject, servePost } from '../_shared/http.ts'
import { consumeRateLimit } from '../_shared/security.ts'
import { rpc } from '../_shared/supabase.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface GroupDrawInput {
  group_id: string
  name: string
  locale: 'es' | 'en'
  event_date: string | null
  exclusions_enabled: boolean
  last_activity_at: string
  members: Array<{
    id: string
    display_name: string
    email: string
  }>
  exclusions: Array<{
    giver_member_id: string
    excluded_member_id: string
  }>
}

interface CompletedDrawRow {
  draw_id: string
  email_count: number
}

servePost(async (request) => {
  const user = await requireAuthenticatedUser(request)
  await consumeRateLimit(
    request,
    'group-draw',
    5,
    900,
    user.id,
  )
  const body = await readJsonObject(request)
  const groupId =
    typeof body.groupId === 'string' ? body.groupId.trim() : ''
  if (!UUID_PATTERN.test(groupId)) {
    throw new HttpError(400, 'invalid_group_id')
  }

  const group = await rpc<GroupDrawInput>('get_group_draw_input_service', {
    p_group_id: groupId,
    p_actor_id: user.id,
  })
  if (
    !Array.isArray(group.members) ||
    !isValidGroupMemberCount(group.members.length)
  ) {
    throw new HttpError(422, 'invalid_group_member_count')
  }

  const exclusionsByGiver = new Map<string, string[]>()
  if (group.exclusions_enabled) {
    for (const exclusion of group.exclusions) {
      const excludedIds = exclusionsByGiver.get(exclusion.giver_member_id) ?? []
      excludedIds.push(exclusion.excluded_member_id)
      exclusionsByGiver.set(exclusion.giver_member_id, excludedIds)
    }
  }
  const participants = group.members.map((member) => ({
    id: member.id,
    excludedIds: exclusionsByGiver.get(member.id) ?? [],
  }))

  let assignments: Map<string, string>
  try {
    assignments = assignRecipients(participants)
  } catch (error) {
    if (error instanceof DrawConstraintError) {
      throw new HttpError(
        error.code === 'impossible_assignment' ? 422 : 400,
        error.code,
      )
    }
    throw error
  }

  const assignmentRows = [...assignments].map(
    ([giverMemberId, receiverMemberId]) => ({
      giver_member_id: giverMemberId,
      receiver_member_id: receiverMemberId,
    }),
  )
  const completed = await rpc<CompletedDrawRow[]>(
    'complete_group_draw_service',
    {
      p_group_id: groupId,
      p_actor_id: user.id,
      p_expected_last_activity_at: group.last_activity_at,
      p_assignments: assignmentRows,
    },
  )
  const draw = completed[0]
  if (!draw) {
    throw new HttpError(503, 'backend_unavailable')
  }

  const delivery = await processGroupEmailOutbox({
    groupId,
    limit: 5,
  }).catch(() => null)
  const sentEmails = delivery?.sent ?? 0

  const response: GroupDrawResponse = {
    drawId: draw.draw_id,
    emailCount: draw.email_count,
    emailStatus: sentEmails >= draw.email_count ? 'sent' : 'pending_delivery',
  }
  return {
    payload: response,
    status: response.emailStatus === 'sent' ? 200 : 202,
  }
})
