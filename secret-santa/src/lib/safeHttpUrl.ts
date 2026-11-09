export function toSafeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null
    }
    return url.href
  } catch {
    return null
  }
}
