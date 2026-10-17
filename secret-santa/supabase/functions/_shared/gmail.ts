import { HttpError, requiredEnv } from './http.ts'
import type { Locale } from '../../../src/models.ts'

export interface GmailContext {
  accessToken: string
  senderEmail: string
  senderName: string
}

function base64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function encodedWord(value: string): string {
  return `=?UTF-8?B?${base64(new TextEncoder().encode(value))}?=`
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? ''
}

export function assertGmailConfigured(): void {
  requiredEnv('GMAIL_CLIENT_ID')
  requiredEnv('GMAIL_CLIENT_SECRET')
  requiredEnv('GMAIL_REFRESH_TOKEN')
  requiredEnv('GMAIL_SENDER_EMAIL')
  requiredEnv('APP_BASE_URL')
}

export async function createGmailContext(): Promise<GmailContext> {
  const clientId = requiredEnv('GMAIL_CLIENT_ID')
  const clientSecret = requiredEnv('GMAIL_CLIENT_SECRET')
  const refreshToken = requiredEnv('GMAIL_REFRESH_TOKEN')
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!tokenResponse.ok) {
    await tokenResponse.body?.cancel()
    throw new HttpError(503, 'email_provider_unavailable')
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string
  }

  if (!tokenData.access_token) {
    throw new HttpError(503, 'email_provider_unavailable')
  }

  const senderEmail = requiredEnv('GMAIL_SENDER_EMAIL')

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)) {
    throw new HttpError(503, 'email_provider_unavailable')
  }

  const senderName = (Deno.env.get('GMAIL_SENDER_NAME') ?? 'Remigo')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 80)

  return {
    accessToken: tokenData.access_token,
    senderEmail,
    senderName: senderName || 'Remigo',
  }
}

export async function sendGuestResultEmail(
  context: GmailContext,
  input: {
    email: string
    participantName: string
    assignedName: string
    resultUrl: string
    locale: Locale
  },
): Promise<void> {
  const subject =
    input.locale === 'es'
      ? 'Tu resultado del Amigo Invisible'
      : 'Your Secret Santa result'
  const message =
    input.locale === 'es'
      ? `Hola ${input.participantName},\n\nYa está listo tu resultado del Amigo Invisible. Te ha tocado: ${input.assignedName}.\n\nPuedes consultar el resultado en este enlace personal:\n${input.resultUrl}\n\nNo compartas este enlace.\n`
      : `Hi ${input.participantName},\n\nYour Secret Santa draw is ready. You got: ${input.assignedName}.\n\nYou can view your result at this personal link:\n${input.resultUrl}\n\nPlease do not share this link.\n`
  const encodedMessage = wrapBase64(
    base64(new TextEncoder().encode(message)),
  )
  const rawMessage = [
    `To: <${input.email}>`,
    `From: ${encodedWord(context.senderName)} <${context.senderEmail}>`,
    `Subject: ${encodedWord(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedMessage,
  ].join('\r\n')
  const raw = base64(new TextEncoder().encode(rawMessage))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  )

  if (!response.ok) {
    await response.body?.cancel()
    throw new HttpError(503, 'email_delivery_failed')
  }
}

export function guestResultUrl(token: string): string {
  const baseUrl = requiredEnv('APP_BASE_URL').replace(/\/+$/, '')
  return `${baseUrl}/guest-result#token=${encodeURIComponent(token)}`
}
