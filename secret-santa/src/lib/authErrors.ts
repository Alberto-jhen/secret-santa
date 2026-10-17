import type { TranslationKey } from '../i18n/translations'

export class AuthConfigurationError extends Error {
  constructor() {
    super('Supabase Auth is not configured')
    this.name = 'AuthConfigurationError'
  }
}

type AuthAction = 'register' | 'login' | 'signOut'

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code
  }

  return undefined
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status
  }

  return undefined
}

export function getAuthErrorKey(
  error: unknown,
  action: AuthAction,
): TranslationKey {
  if (error instanceof AuthConfigurationError) {
    return 'authErrorNotConfigured'
  }

  const code = getErrorCode(error)

  if (action === 'register' && code === 'weak_password') {
    return 'registerErrorWeakPassword'
  }
  if (action === 'login' && code === 'email_not_confirmed') {
    return 'loginErrorEmailNotConfirmed'
  }

  if (
    action === 'login' &&
    (code === 'invalid_credentials' || code === 'invalid_grant')
  ) {
    return 'loginErrorInvalidCredentials'
  }

  if (
    getErrorStatus(error) === 429 ||
    code === 'over_email_send_rate_limit'
  ) {
    return 'authErrorRateLimit'
  }

  return action === 'login' ? 'loginErrorGeneric' : 'authErrorGeneric'
}
