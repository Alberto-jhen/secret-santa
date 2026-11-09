import { HttpError, requiredEnv } from './http.ts'

export interface AuthenticatedUser {
  id: string
  email: string
}

export async function requireAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser> {
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(authorization)
  if (!match) {
    throw new HttpError(401, 'authentication_required')
  }

  const baseUrl = requiredEnv('SUPABASE_URL').replace(/\/+$/, '')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${match[1]}`,
    },
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new HttpError(401, 'authentication_required')
  }

  let user: { id?: unknown; email?: unknown }
  try {
    user = (await response.json()) as { id?: unknown; email?: unknown }
  } catch {
    throw new HttpError(401, 'authentication_required')
  }

  if (
    typeof user.id !== 'string' ||
    typeof user.email !== 'string' ||
    user.email.trim().length === 0
  ) {
    throw new HttpError(401, 'authentication_required')
  }

  return { id: user.id, email: user.email }
}
