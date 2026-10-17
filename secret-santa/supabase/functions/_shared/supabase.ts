import { HttpError, requiredEnv } from './http.ts'

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
    await response.body?.cancel()
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
