import type { InvitationPreview, Locale } from '../../../src/models.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { processGroupEmailOutbox } from '../_shared/groupEmail.ts'
import {
  HttpError,
  readJsonObject,
  requiredEnv,
  servePost,
} from '../_shared/http.ts'
import {
  consumeRateLimit,
  deriveGroupInvitationToken,
  sha256Hex,
} from '../_shared/security.ts'
import { rpc } from '../_shared/supabase.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface InvitationPreviewRow {
  invitation_id: string
  group_id: string
  group_name: string
  invited_email: string
  invited_display_name: string
  expires_at: string
  locale: Locale
}

interface CreatedInvitationRow {
  invitation_id: string
  group_id: string
  group_name: string
  recipient_email: string
  recipient_name: string
  locale: Locale
  expires_at: string
  outbox_id: string
}

interface RespondedInvitationRow {
  group_id: string
  group_name: string
}

function requiredString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  errorCode: string,
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, errorCode)
  }
  const normalized = value.trim()
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength ||
    containsControlCharacter
  ) {
    throw new HttpError(400, errorCode)
  }
  return normalized
}

function readToken(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
    throw new HttpError(400, 'invalid_invitation_token')
  }
  return value
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@')
  const visibleLocal = localPart.length <= 2
    ? `${localPart[0] ?? ''}…`
    : `${localPart.slice(0, 2)}…`
  const [domainName, ...domainSuffix] = domain.split('.')
  return `${visibleLocal}@${domainName.slice(0, 1)}…${domainSuffix.length > 0 ? `.${domainSuffix.join('.')}` : ''}`
}

function asInvitationPreview(row: InvitationPreviewRow): InvitationPreview {
  return {
    invitationId: row.invitation_id,
    groupId: row.group_id,
    groupName: row.group_name,
    displayName: row.invited_display_name,
    emailHint: maskEmail(row.invited_email),
    expiresAt: row.expires_at,
    locale: row.locale,
  }
}

servePost(async (request) => {
  const body = await readJsonObject(request)
  const action = body.action

  if (action === 'preview') {
    await consumeRateLimit(request, 'group-invitation-preview', 20, 900)
    const token = readToken(body.token)
    const rows = await rpc<InvitationPreviewRow[]>(
      'preview_group_invitation_service',
      { p_token_hash: await sha256Hex(token) },
    )
    const invitation = rows[0]
    if (!invitation) {
      throw new HttpError(404, 'invitation_not_found_or_expired')
    }
    return { payload: asInvitationPreview(invitation) }
  }

  if (action === 'invite') {
    const user = await requireAuthenticatedUser(request)
    await consumeRateLimit(
      request,
      'group-invite-create',
      20,
      900,
      user.id,
    )
    const groupId = requiredString(body.groupId, 36, 36, 'invalid_group_id')
    if (!UUID_PATTERN.test(groupId)) {
      throw new HttpError(400, 'invalid_group_id')
    }
    const email = requiredString(body.email, 3, 254, 'invalid_email').toLowerCase()
    const displayName = requiredString(
      body.displayName,
      1,
      80,
      'invalid_display_name',
    )
    if (!EMAIL_PATTERN.test(email)) {
      throw new HttpError(400, 'invalid_email')
    }

    requiredEnv('GROUP_INVITATION_TOKEN_SECRET', 32)
    const invitationId = crypto.randomUUID()
    const token = await deriveGroupInvitationToken(invitationId)
    const tokenHash = await sha256Hex(token)
    const rows = await rpc<CreatedInvitationRow[]>(
      'issue_group_invitation_service',
      {
        p_invitation_id: invitationId,
        p_group_id: groupId,
        p_actor_id: user.id,
        p_email: email,
        p_display_name: displayName,
        p_token_hash: tokenHash,
      },
    )
    const invitation = rows[0]
    if (!invitation) {
      throw new HttpError(503, 'backend_unavailable')
    }

    let status: 'sent' | 'pending_delivery' = 'pending_delivery'
    try {
      const delivery = await processGroupEmailOutbox({
        groupId,
        outboxId: invitation.outbox_id,
        limit: 1,
      })
      if (delivery.sent > 0) {
        status = 'sent'
      }
    } catch {
      status = 'pending_delivery'
    }

    return {
      payload: {
        status,
        expiresAt: invitation.expires_at,
      },
    }
  }

  if (action === 'respond') {
    const user = await requireAuthenticatedUser(request)
    await consumeRateLimit(
      request,
      'group-invitation-respond',
      10,
      900,
      user.id,
    )
    const token = readToken(body.token)
    if (typeof body.accept !== 'boolean') {
      throw new HttpError(400, 'invalid_invitation_response')
    }
    const rows = await rpc<RespondedInvitationRow[]>(
      'respond_group_invitation_service',
      {
        p_token_hash: await sha256Hex(token),
        p_actor_id: user.id,
        p_actor_email: user.email,
        p_accept: body.accept,
      },
    )
    const invitation = rows[0]
    if (!invitation) {
      throw new HttpError(404, 'invitation_not_found_or_expired')
    }
    return {
      payload: {
        groupId: invitation.group_id,
        status: body.accept ? 'accepted' : 'declined',
      },
    }
  }

  throw new HttpError(400, 'invalid_action')
})
