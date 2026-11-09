export function safeReturnTo(
  value: string | null | undefined,
  fallback = '/groups',
): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback
  }

  try {
    const target = new URL(value, window.location.origin)
    if (target.origin !== window.location.origin) {
      return fallback
    }
    if (target.pathname === '/auth/callback') {
      return fallback
    }

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}

export function authCallbackUrl(returnTo = '/groups'): string {
  const callback = new URL('/auth/callback', window.location.origin)
  callback.searchParams.set('returnTo', safeReturnTo(returnTo))
  return callback.toString()
}
