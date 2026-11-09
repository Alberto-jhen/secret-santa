import { HttpError, requiredEnv } from './http.ts'
import type { Locale } from '../../../src/models.ts'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export interface ResendContext {
  apiKey: string
  from: string
}

function senderEmail(): string {
  const email = requiredEnv('RESEND_FROM_EMAIL')

  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(503, 'service_not_configured')
  }

  return email
}

export function assertResendConfigured(): void {
  requiredEnv('RESEND_API_KEY')
  senderEmail()
  requiredEnv('APP_BASE_URL')
}

export function createResendContext(): ResendContext {
  const name = (Deno.env.get('RESEND_FROM_NAME') ?? 'Remigo')
    .replace(/[\r\n<>"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return {
    apiKey: requiredEnv('RESEND_API_KEY'),
    from: `${name || 'Remigo'} <${senderEmail()}>`,
  }
}

async function sendPlainTextEmail(
  context: ResendContext,
  email: string,
  subject: string,
  message: string,
): Promise<void> {
  if (!EMAIL_PATTERN.test(email) || /[\r\n]/.test(email)) {
    throw new HttpError(400, 'invalid_email')
  }

  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: context.from,
      to: [email],
      subject: subject.replace(/[\r\n]/g, ' ').trim(),
      text: message,
    }),
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new HttpError(503, 'email_delivery_failed')
  }

  await response.body?.cancel()
}

export async function sendGuestResultEmail(
  context: ResendContext,
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

  await sendPlainTextEmail(context, input.email, subject, message)
}

export function guestResultUrl(token: string): string {
  const baseUrl = requiredEnv('APP_BASE_URL').replace(/\/+$/, '')
  return `${baseUrl}/guest-result#token=${encodeURIComponent(token)}`
}

export function groupInvitationUrl(token: string): string {
  const baseUrl = requiredEnv('APP_BASE_URL').replace(/\/+$/, '')
  return `${baseUrl}/invitation#token=${encodeURIComponent(token)}`
}

export function groupPageUrl(groupId: string): string {
  const baseUrl = requiredEnv('APP_BASE_URL').replace(/\/+$/, '')
  return `${baseUrl}/groups/${encodeURIComponent(groupId)}`
}

export async function sendGroupInvitationEmail(
  context: ResendContext,
  input: {
    email: string
    recipientName: string
    groupName: string
    invitationUrl: string
    locale: Locale
  },
): Promise<void> {
  const subject =
    input.locale === 'es'
      ? `Invitación a ${input.groupName} en Remigo`
      : `Invitation to ${input.groupName} on Remigo`
  const message =
    input.locale === 'es'
      ? `Hola ${input.recipientName},\n\nTe han invitado a participar en el Amigo Invisible «${input.groupName}».\n\nInicia sesión o crea tu cuenta con este mismo correo y acepta la invitación aquí:\n${input.invitationUrl}\n\nEl enlace caduca en 14 días y solo se puede utilizar una vez.\n`
      : `Hi ${input.recipientName},\n\nYou have been invited to join the Secret Santa group “${input.groupName}”.\n\nSign in or create an account with this email address, then accept the invitation here:\n${input.invitationUrl}\n\nThis link expires in 14 days and can only be used once.\n`

  await sendPlainTextEmail(context, input.email, subject, message)
}

export async function sendGroupDrawResultEmail(
  context: ResendContext,
  input: {
    email: string
    recipientName: string
    assignedName: string
    groupName: string
    groupUrl: string
    eventDate: string | null
    minimumBudget: number | null
    maximumBudget: number | null
    locale: Locale
  },
): Promise<void> {
  const subject =
    input.locale === 'es'
      ? `Tu Amigo Invisible de ${input.groupName}`
      : `Your Secret Santa match for ${input.groupName}`
  const budget = new Intl.NumberFormat(input.locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
  const budgetText =
    input.minimumBudget !== null && input.maximumBudget !== null
      ? `${budget.format(input.minimumBudget)}–${budget.format(input.maximumBudget)}`
      : input.maximumBudget !== null
        ? input.locale === 'es'
          ? `hasta ${budget.format(input.maximumBudget)}`
          : `up to ${budget.format(input.maximumBudget)}`
        : input.minimumBudget !== null
          ? input.locale === 'es'
            ? `desde ${budget.format(input.minimumBudget)}`
            : `at least ${budget.format(input.minimumBudget)}`
          : ''
  const eventLine =
    input.eventDate === null
      ? ''
      : input.locale === 'es'
        ? `\nFecha del encuentro: ${input.eventDate}.`
        : `\nEvent date: ${input.eventDate}.`
  const budgetLine =
    budgetText.length === 0
      ? ''
      : input.locale === 'es'
        ? `\nPresupuesto: ${budgetText}.`
        : `\nBudget: ${budgetText}.`
  const message =
    input.locale === 'es'
      ? `Hola ${input.recipientName},\n\nYa está listo el sorteo de «${input.groupName}». Te ha tocado regalar a: ${input.assignedName}.${eventLine}${budgetLine}\n\nConsulta el grupo y su lista de ideas en tu cuenta de Remigo:\n${input.groupUrl}\n\nNo compartas este correo: el resultado es privado.\n`
      : `Hi ${input.recipientName},\n\nThe draw for “${input.groupName}” is ready. You are giving a gift to: ${input.assignedName}.${eventLine}${budgetLine}\n\nOpen the group and their gift-idea list in your Remigo account:\n${input.groupUrl}\n\nPlease keep this email private.\n`

  await sendPlainTextEmail(context, input.email, subject, message)
}
