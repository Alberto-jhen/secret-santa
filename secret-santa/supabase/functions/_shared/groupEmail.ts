import type { Locale } from '../../../src/models.ts'
import { HttpError } from './http.ts'
import {
  assertResendConfigured,
  createResendContext,
  groupInvitationUrl,
  groupPageUrl,
  sendGroupDrawResultEmail,
  sendGroupInvitationEmail,
} from './resend.ts'
import {
  deriveGroupInvitationToken,
  reserveEmailQuota,
  sha256Hex,
} from './security.ts'
import { rpc } from './supabase.ts'

interface GroupEmailDelivery {
  outbox_id: string
  kind: 'invitation' | 'draw_result'
  group_id: string
  draw_id: string | null
  invitation_id: string | null
  member_id: string
  recipient_email: string
  recipient_name: string
  locale: Locale
  payload: {
    group_name?: string
    assigned_name?: string
    event_date?: string | null
    minimum_budget?: number | null
    maximum_budget?: number | null
  }
}

export interface GroupEmailProcessResult {
  sent: number
  failed: number
  deferred: number
}

function safeDeliveryError(error: unknown): string {
  if (
    error instanceof HttpError &&
    error.code === 'invitation_not_found_or_expired'
  ) {
    return 'invitation_revoked'
  }
  return error instanceof HttpError && error.code === 'email_delivery_failed'
    ? 'email_delivery_failed'
    : 'email_provider_unavailable'
}

export async function processGroupEmailOutbox(options: {
  groupId?: string
  outboxId?: string
  limit?: number
} = {}): Promise<GroupEmailProcessResult> {
  const claimToken = crypto.randomUUID()
  const pending = await rpc<GroupEmailDelivery[]>(
    'claim_group_email_outbox_service',
    {
      p_claim_token: claimToken,
      p_limit: options.limit ?? 50,
      p_group_id: options.groupId ?? null,
      p_outbox_id: options.outboxId ?? null,
    },
  )

  if (pending.length === 0) {
    return { sent: 0, failed: 0, deferred: 0 }
  }

  let resendContext: ReturnType<typeof createResendContext>
  try {
    assertResendConfigured()
    resendContext = createResendContext()
  } catch {
    await rpc('release_group_email_claims_service', {
      p_claim_token: claimToken,
    })
    return { sent: 0, failed: 0, deferred: pending.length }
  }

  let sent = 0
  let failed = 0
  let deferred = 0

  for (let index = 0; index < pending.length; index += 1) {
    const delivery = pending[index]
    const quotaAvailable = await reserveEmailQuota().catch(() => false)
    if (!quotaAvailable) {
      deferred = pending.length - index
      await rpc('release_group_email_claims_service', {
        p_claim_token: claimToken,
      })
      break
    }

    try {
      if (delivery.kind === 'invitation') {
        if (!delivery.invitation_id) {
          throw new HttpError(503, 'backend_unavailable')
        }
        const token = await deriveGroupInvitationToken(delivery.invitation_id)
        const tokenHash = await sha256Hex(token)
        const isCurrentInvitation = await rpc<boolean>(
          'assert_group_invitation_token_service',
          {
            p_invitation_id: delivery.invitation_id,
            p_token_hash: tokenHash,
          },
        )
        if (!isCurrentInvitation) {
          throw new HttpError(409, 'invitation_not_found_or_expired')
        }
        await sendGroupInvitationEmail(resendContext, {
          email: delivery.recipient_email,
          recipientName: delivery.recipient_name,
          groupName: delivery.payload.group_name ?? 'Remigo',
          invitationUrl: groupInvitationUrl(token),
          locale: delivery.locale,
        })
      } else {
        const isCurrentDraw = await rpc<boolean>(
          'assert_group_draw_result_delivery_service',
          {
            p_outbox_id: delivery.outbox_id,
            p_claim_token: claimToken,
          },
        )
        if (!isCurrentDraw) {
          continue
        }
        await sendGroupDrawResultEmail(resendContext, {
          email: delivery.recipient_email,
          recipientName: delivery.recipient_name,
          assignedName: delivery.payload.assigned_name ?? '',
          groupName: delivery.payload.group_name ?? 'Remigo',
          groupUrl: groupPageUrl(delivery.group_id),
          eventDate: delivery.payload.event_date ?? null,
          minimumBudget: delivery.payload.minimum_budget ?? null,
          maximumBudget: delivery.payload.maximum_budget ?? null,
          locale: delivery.locale,
        })
      }
      await rpc('mark_group_email_outbox_service', {
        p_outbox_id: delivery.outbox_id,
        p_claim_token: claimToken,
        p_delivery_state: 'sent',
        p_error_code: null,
      })
      sent += 1
    } catch (error) {
      await rpc('mark_group_email_outbox_service', {
        p_outbox_id: delivery.outbox_id,
        p_claim_token: claimToken,
        p_delivery_state: 'failed',
        p_error_code: safeDeliveryError(error),
      })
      failed += 1
    }
  }

  return { sent, failed, deferred }
}
