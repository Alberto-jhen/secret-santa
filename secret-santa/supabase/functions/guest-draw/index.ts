import {
  assignRecipients,
  DrawConstraintError,
} from '../_shared/assignment.ts'
import type {
  GuestDrawDeliveryRecord,
  GuestParticipantInput,
  Locale,
} from '../../../src/models.ts'
import {
  assertResendConfigured,
  createResendContext,
  guestResultUrl,
  sendGuestResultEmail,
} from '../_shared/resend.ts'
import {
  HttpError,
  readJsonObject,
  requiredEnv,
  servePost,
} from '../_shared/http.ts'
import {
  consumeRateLimit,
  deriveGuestToken,
  reserveEmailQuota,
  sha256Hex,
} from '../_shared/security.ts'
import { rpc } from '../_shared/supabase.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint < 0x20 || codePoint === 0x7f
  })
}

function readParticipants(value: unknown): GuestParticipantInput[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 50) {
    throw new HttpError(400, 'invalid_participant_count')
  }

  const participants = value.map((item): GuestParticipantInput => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new HttpError(400, 'invalid_participant')
    }

    const input = item as Record<string, unknown>
    const clientId =
      typeof input.clientId === 'string' ? input.clientId.trim() : ''
    const displayName =
      typeof input.displayName === 'string' ? input.displayName.trim() : ''
    const email =
      typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
    const excludedClientIds = input.excludedClientIds

    if (
      !UUID_PATTERN.test(clientId) ||
      displayName.length < 1 ||
      displayName.length > 80 ||
      containsControlCharacter(displayName) ||
      email.length > 254 ||
      !EMAIL_PATTERN.test(email) ||
      !Array.isArray(excludedClientIds) ||
      excludedClientIds.some(
        (excludedId) =>
          typeof excludedId !== 'string' ||
          !UUID_PATTERN.test(excludedId),
      )
    ) {
      throw new HttpError(400, 'invalid_participant')
    }

    return {
      clientId,
      displayName,
      email,
      excludedClientIds: [...new Set(excludedClientIds as string[])],
    }
  })

  if (
    new Set(participants.map(({ clientId }) => clientId)).size !==
      participants.length ||
    new Set(participants.map(({ email }) => email)).size !== participants.length
  ) {
    throw new HttpError(400, 'duplicate_participant')
  }

  const participantIds = new Set(
    participants.map(({ clientId }) => clientId),
  )

  for (const participant of participants) {
    if (
      participant.excludedClientIds.includes(participant.clientId) ||
      participant.excludedClientIds.some(
        (excludedId) => !participantIds.has(excludedId),
      )
    ) {
      throw new HttpError(400, 'invalid_exclusion')
    }
  }

  return participants
}

function readEventDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, 'invalid_event_date')
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)

  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < new Date().toISOString().slice(0, 10)
  ) {
    throw new HttpError(400, 'invalid_event_date')
  }

  return value
}

function validateRequestId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, 'invalid_request_id')
  }

  return value
}

function validateLocale(value: unknown): Locale {
  if (value !== 'es' && value !== 'en') {
    throw new HttpError(400, 'invalid_locale')
  }

  return value
}

function safeDeliveryError(error: unknown): string {
  return error instanceof HttpError && error.code === 'email_delivery_failed'
    ? 'email_delivery_failed'
    : 'email_provider_unavailable'
}

servePost(async (request) => {
  await consumeRateLimit(request, 'guest-draw', 3, 900)

  const body = await readJsonObject(request)
  const requestId = validateRequestId(body.requestId)
  const eventDate = readEventDate(body.eventDate)
  const locale = validateLocale(body.locale)
  const participants = readParticipants(body.participants)
  const clientIdToServerId = new Map(
    participants.map(({ clientId }) => [clientId, crypto.randomUUID()]),
  )

  const normalizedPayload = {
    eventDate,
    locale,
    participants: participants.map((participant) => ({
      clientId: participant.clientId,
      displayName: participant.displayName,
      email: participant.email,
      excludedClientIds: [...participant.excludedClientIds].sort(),
    })),
  }
  const payloadHash = await sha256Hex(JSON.stringify(normalizedPayload))
  const participantsForMatching = participants.map((participant) => ({
    id: clientIdToServerId.get(participant.clientId)!,
    excludedIds: participant.excludedClientIds.map(
      (excludedId) => clientIdToServerId.get(excludedId)!,
    ),
  }))

  let assignments: Map<string, string>

  try {
    assignments = assignRecipients(participantsForMatching)
  } catch (error) {
    if (error instanceof DrawConstraintError) {
      throw new HttpError(
        error.code === 'impossible_assignment' ? 422 : 400,
        error.code,
      )
    }

    throw error
  }

  assertResendConfigured()
  requiredEnv('GUEST_ACCESS_TOKEN_SECRET', 32)
  requiredEnv('GUEST_RATE_LIMIT_SECRET', 32)

  const expiresFrom = eventDate
    ? new Date(`${eventDate}T00:00:00.000Z`).valueOf()
    : Date.now()
  const expiresAt = new Date(expiresFrom + 30 * 24 * 60 * 60 * 1000)
  const participantByServerId = new Map(
    participants.map((participant) => [
      clientIdToServerId.get(participant.clientId)!,
      participant,
    ]),
  )
  const rows = await Promise.all(
    participantsForMatching.map(async (participant) => {
      const participantInput = participantByServerId.get(participant.id)!

      return {
        id: participant.id,
        display_name: participantInput.displayName,
        email: participantInput.email,
        access_token_hash: await sha256Hex(
          await deriveGuestToken(requestId, participant.id),
        ),
      }
    }),
  )
  const exclusions = participantsForMatching.flatMap((participant) =>
    participant.excludedIds.map((excludedId) => ({
      giver_id: participant.id,
      excluded_id: excludedId,
    })),
  )
  const assignmentRows = [...assignments].map(([giverId, receiverId]) => ({
    giver_id: giverId,
    receiver_id: receiverId,
  }))
  const drawId = await rpc<string>('create_guest_draw', {
    p_request_id: requestId,
    p_payload_hash: payloadHash,
    p_event_date: eventDate,
    p_locale: locale,
    p_expires_at: expiresAt.toISOString(),
    p_participants: rows,
    p_exclusions: exclusions,
    p_assignments: assignmentRows,
  })
  const claimToken = crypto.randomUUID()
  const deliveryRows = await rpc<GuestDrawDeliveryRecord[]>(
    'get_guest_draw_delivery',
    { p_draw_id: drawId, p_claim_token: claimToken },
  )
  const pendingRows = deliveryRows.filter(
    (participant) => participant.delivery_state !== 'sent',
  )

  if (pendingRows.length === 0) {
    return { payload: { status: 'sent', pendingCount: 0 } }
  }
  const claimedRows = pendingRows.filter(
    (participant) => participant.claimed_by_request,
  )
  let pendingCount = pendingRows.length - claimedRows.length

  if (claimedRows.length === 0) {
    return {
      status: 202,
      payload: { status: 'pending_delivery', pendingCount },
    }
  }

  let resendContext: ReturnType<typeof createResendContext> | undefined

  for (let index = 0; index < claimedRows.length; index += 1) {
    const participant = claimedRows[index]

    if (!resendContext) {
      try {
        resendContext = createResendContext()
      } catch {
        pendingCount += claimedRows.length - index
        await rpc('release_guest_delivery_claims', {
          p_claim_token: claimToken,
        })
        break
      }
    }
    if (!(await reserveEmailQuota())) {
      pendingCount += claimedRows.length - index
      await rpc('release_guest_delivery_claims', {
        p_claim_token: claimToken,
      })
      break
    }

    try {
      const token = await deriveGuestToken(drawId, participant.participant_id)

      await sendGuestResultEmail(resendContext, {
        email: participant.email,
        participantName: participant.display_name,
        assignedName: participant.assigned_name,
        resultUrl: guestResultUrl(token),
        locale,
      })
      await rpc('mark_guest_notification_sent', {
        p_draw_id: drawId,
        p_participant_id: participant.participant_id,
        p_claim_token: claimToken,
        p_delivery_state: 'sent',
        p_error_code: null,
      })
    } catch (error) {
      pendingCount += 1
      await rpc('mark_guest_notification_sent', {
        p_draw_id: drawId,
        p_participant_id: participant.participant_id,
        p_claim_token: claimToken,
        p_delivery_state: 'failed',
        p_error_code: safeDeliveryError(error),
      })
    }
  }

  return {
    status: pendingCount > 0 ? 202 : 200,
    payload: {
      status: pendingCount > 0 ? 'pending_delivery' : 'sent',
      pendingCount,
    },
  }
})
