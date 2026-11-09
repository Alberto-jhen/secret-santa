import { HttpError, requiredEnv } from './http.ts'
const SAFE_RPC_ERRORS: Readonly<Record<string, number>> = {
  authentication_required: 401,
  group_not_found_or_forbidden: 403,
  group_invite_forbidden: 403,
  exclusion_edit_forbidden: 403,
  active_membership_required: 403,
  draw_not_cancellable: 403,
  invitation_email_mismatch: 403,
  email_already_in_group: 409,
  already_a_group_member: 409,
  group_changed_during_draw: 409,
  group_is_locked: 409,
  group_not_open: 409,
  cancel_draw_before_cancelling_group: 409,
  organizer_cannot_leave_group: 409,
  exclusions_disabled: 409,
  invitation_not_found_or_expired: 404,
  completed_draw_not_found: 404,
  group_member_limit: 422,
  invalid_group_member_count: 422,
  invalid_assignment_count: 422,
  assignment_violates_group_rules: 422,
  invalid_exclusion: 422,
  giver_not_active: 422,
  invalid_invitation: 400,
  invalid_invitation_response: 400,
  invalid_group_name: 400,
  invalid_locale: 400,
  invalid_budget: 400,
  invalid_assignments: 400,
  group_draw_forbidden: 403,
}

function rpcErrorStatus(code: string): number | null {
  return SAFE_RPC_ERRORS[code] ?? null
}

export async function rpc<T>(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const url = requiredEnv('SUPABASE_URL').replace(/\/+$/, '')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(
    `${url}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameters),
    },
  )

  if (!response.ok) {
    let message = ''
    try {
      const payload = (await response.json()) as { message?: unknown }
      if (typeof payload.message === 'string') {
        message = payload.message
      }
    } catch {
      await response.body?.cancel()
    }
    const status = rpcErrorStatus(message)
    if (status !== null) {
      throw new HttpError(status, message)
    }
    throw new HttpError(503, 'backend_unavailable')
  }

  const result = await response.text()

  if (!result) {
    return null as T
  }

  try {
    return JSON.parse(result) as T
  } catch {
    throw new HttpError(503, 'backend_unavailable')
  }
}
