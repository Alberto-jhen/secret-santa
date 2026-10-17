import { HttpError, readJsonObject, requiredEnv, servePost } from '../_shared/http.ts'
import { consumeRateLimit, sha256Hex } from '../_shared/security.ts'
import { rpc } from '../_shared/supabase.ts'
import type { GuestAssignmentRecord } from '../../../src/models.ts'

servePost(async (request) => {
  requiredEnv('GUEST_RATE_LIMIT_SECRET', 32)
  const body = await readJsonObject(request)
  const token = typeof body.token === 'string' ? body.token : ''

  if (token.length < 32 || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new HttpError(400, 'invalid_result_token')
  }

  await consumeRateLimit(request, 'guest-result', 60, 3600)
  const tokenHash = await sha256Hex(token)
  const rows = await rpc<GuestAssignmentRecord[]>('get_guest_assignment', {
    p_token_hash: tokenHash,
  })
  const assignment = rows[0]

  if (!assignment) {
    throw new HttpError(404, 'result_not_found')
  }

  return {
    payload: {
      displayName: assignment.display_name,
      assignedName: assignment.assigned_name,
      eventDate: assignment.event_date,
      locale: assignment.locale,
      expiresAt: assignment.expires_at,
    },
  }
})
