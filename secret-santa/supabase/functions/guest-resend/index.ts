import {
  assertGmailConfigured,
  createGmailContext,
  guestResultUrl,
  sendGuestResultEmail,
} from '../_shared/gmail.ts'
import type { GuestAssignmentRecord } from '../../../src/models.ts'
import {
  HttpError,
  readJsonObject,
  requiredEnv,
  servePost,
} from '../_shared/http.ts'
import { consumeRateLimit, reserveEmailQuota, sha256Hex } from '../_shared/security.ts'
import { rpc } from '../_shared/supabase.ts'

servePost(async (request) => {
  requiredEnv('GUEST_RATE_LIMIT_SECRET', 32)
  const body = await readJsonObject(request)
  const token = typeof body.token === 'string' ? body.token : ''

  if (token.length < 32 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new HttpError(400, 'invalid_result_token')
  }

  const tokenHash = await sha256Hex(token)
  await consumeRateLimit(request, 'guest-resend', 5, 3600, tokenHash)
  const rows = await rpc<GuestAssignmentRecord[]>('get_guest_assignment', {
    p_token_hash: tokenHash,
  })
  const assignment = rows[0]

  if (!assignment) {
    throw new HttpError(404, 'result_not_found')
  }

  assertGmailConfigured()
  const gmailContext = await createGmailContext()

  if (!(await reserveEmailQuota())) {
    throw new HttpError(429, 'daily_email_limit')
  }

  try {
    await sendGuestResultEmail(gmailContext, {
      email: assignment.email,
      participantName: assignment.display_name,
      assignedName: assignment.assigned_name,
      resultUrl: guestResultUrl(token),
      locale: assignment.locale,
    })
  } catch {
    throw new HttpError(503, 'email_delivery_failed')
  }


  return { payload: { status: 'sent' } }
})
