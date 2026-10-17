export class GuestDrawApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'GuestDrawApiError'
    this.status = status
    this.code = code
  }
}

export async function invokeGuestFunction<T>(
  functionName: 'guest-draw' | 'guest-result' | 'guest-resend',
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !anonKey) {
    throw new GuestDrawApiError(0, 'backend_not_configured')
  }

  let response: Response

  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    })
  } catch {
    throw new GuestDrawApiError(0, 'network_error')
  }

  let result: unknown

  try {
    result = await response.json()
  } catch {
    result = null
  }

  if (!response.ok) {
    const code =
      typeof result === 'object' &&
      result !== null &&
      'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : 'request_failed'

    throw new GuestDrawApiError(response.status, code)
  }

  return result as T
}
