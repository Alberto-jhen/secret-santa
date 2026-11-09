import { HttpError, clientIp, requiredEnv } from './http.ts'
import { rpc } from './supabase.ts'

const encoder = new TextEncoder()

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return bytesToHex(new Uint8Array(digest))
}

export async function hmacBytes(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return new Uint8Array(signature)
}

export async function deriveGuestToken(
  drawId: string,
  participantId: string,
): Promise<string> {
  const secret = requiredEnv('GUEST_ACCESS_TOKEN_SECRET', 32)
  const token = await hmacBytes(
    secret,
    `secret-santa-guest-result:v1:${drawId}:${participantId}`,
  )

  return bytesToBase64Url(token)
}

export async function deriveGroupInvitationToken(
  invitationId: string,
): Promise<string> {
  const secret = requiredEnv('GROUP_INVITATION_TOKEN_SECRET', 32)
  const token = await hmacBytes(
    secret,
    `remigo-group-invitation:v1:${invitationId}`,
  )

  return bytesToBase64Url(token)
}

export async function consumeRateLimit(
  request: Request,
  scope: string,
  maximumRequests: number,
  windowSeconds: number,
  additionalIdentity = '',
): Promise<void> {
  const ip = clientIp(request)
  const secret = requiredEnv('GUEST_RATE_LIMIT_SECRET', 32)
  const keyHash = bytesToHex(
    await hmacBytes(secret, `${scope}:${ip}:${additionalIdentity}`),
  )
  const allowed = await rpc<boolean>('consume_guest_draw_rate_limit', {
    p_key_hash: keyHash,
    p_max_requests: maximumRequests,
    p_window_seconds: windowSeconds,
  })

  if (!allowed) {
    throw new HttpError(429, 'rate_limit_exceeded')
  }
}

export async function reserveEmailQuota(): Promise<boolean> {
  return rpc<boolean>('reserve_guest_email_quota', { p_amount: 1 })
}
