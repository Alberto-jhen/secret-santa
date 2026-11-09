import {
  assertResendConfigured,
  createResendContext,
  guestResultUrl,
  sendGuestResultEmail,
} from '../_shared/resend.ts'
import type { PendingGuestDelivery } from '../../../src/models.ts'
import { HttpError, serveProtectedPost } from '../_shared/http.ts'
import { processGroupEmailOutbox } from '../_shared/groupEmail.ts'
import { deriveGuestToken, reserveEmailQuota } from '../_shared/security.ts'
import { rpc } from '../_shared/supabase.ts'

serveProtectedPost(
  'x-outbox-secret',
  'GUEST_OUTBOX_SECRET',
  async () => {
    const claimToken = crypto.randomUUID()
    const pending = await rpc<PendingGuestDelivery[]>(
      'get_pending_guest_deliveries',
      { p_claim_token: claimToken, p_limit: 50 },
    )

    if (pending.length === 0) {
      const groupDelivery = await processGroupEmailOutbox()
      return {
        payload: {
          processed: groupDelivery.sent + groupDelivery.failed,
          failed: groupDelivery.failed,
          deferred: groupDelivery.deferred,
        },
      }
    }

    let resendContext: ReturnType<typeof createResendContext>

    try {
      assertResendConfigured()
      resendContext = createResendContext()
    } catch (error) {
      await rpc('release_guest_delivery_claims', {
        p_claim_token: claimToken,
      })
      throw error
    }

    if (!(await reserveEmailQuota())) {
      await rpc('release_guest_delivery_claims', {
        p_claim_token: claimToken,
      })
      return {
        payload: { processed: 0, failed: 0, deferred: pending.length },
      }
    }
    let processed = 0
    let failed = 0
    let deferred = 0

    for (let index = 0; index < pending.length; index += 1) {
      const delivery = pending[index]

      if (index > 0 && !(await reserveEmailQuota())) {
        deferred = pending.length - index
        await rpc('release_guest_delivery_claims', {
          p_claim_token: claimToken,
        })
        break
      }

      try {
        const token = await deriveGuestToken(
          delivery.draw_id,
          delivery.participant_id,
        )

        await sendGuestResultEmail(resendContext, {
          email: delivery.email,
          participantName: delivery.display_name,
          assignedName: delivery.assigned_name,
          resultUrl: guestResultUrl(token),
          locale: delivery.locale,
        })
        await rpc('mark_guest_notification_sent', {
          p_draw_id: delivery.draw_id,
          p_participant_id: delivery.participant_id,
          p_claim_token: claimToken,
          p_delivery_state: 'sent',
          p_error_code: null,
        })
      } catch (error) {
        failed += 1
        await rpc('mark_guest_notification_sent', {
          p_draw_id: delivery.draw_id,
          p_participant_id: delivery.participant_id,
          p_claim_token: claimToken,
          p_delivery_state: 'failed',
          p_error_code:
            error instanceof HttpError &&
            error.code === 'email_delivery_failed'
              ? 'email_delivery_failed'
              : 'email_provider_unavailable',
        })
      }

      processed += 1
    }

    const groupDelivery = await processGroupEmailOutbox()
    return {
      payload: {
        processed: processed + groupDelivery.sent + groupDelivery.failed,
        failed: failed + groupDelivery.failed,
        deferred: deferred + groupDelivery.deferred,
      },
    }
  },
)
