import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../i18n/useTranslation'
import { getAuthErrorKey } from '../../lib/authErrors'
import { ButtonLink } from '../ui/ButtonLink'
import { toast } from '../../lib/toast'

export function AuthHeaderActions() {
  const { isLoggedIn, loading, signOut, user } = useAuth()
  const { t } = useTranslation()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const metadataName = user?.user_metadata.name
  const displayName =
    typeof metadataName === 'string' && metadataName.trim()
      ? metadataName.trim()
      : user?.email ?? t('authSignedInAs')

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      await signOut()
      toast.add({
        type: 'success',
        title: t('authSignOutSuccessTitle'),
        description: t('authSignOutSuccess'),
      })
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('authErrorTitle'),
        description: t(getAuthErrorKey(error, 'signOut')),
        priority: 'high',
      })
    } finally {
      setIsSigningOut(false)
    }
  }

  if (loading) {
    return (
      <span
        aria-label={t('authCheckingSession')}
        className="h-9 w-24 animate-pulse rounded-full bg-[#e5ebe5]"
        role="status"
      />
    )
  }

  if (isLoggedIn) {
    return (
      <div className="flex items-center gap-3">
        {/* Current account identity is visible on wider layouts. */}
        <span
          className="hidden max-w-[150px] truncate text-xs font-medium text-[#344d40] lg:inline"
          title={displayName}
        >
          {displayName}
        </span>
        {/* Session exit is available from every route. */}
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cad7cc] px-4 text-xs font-semibold text-[#174b3a] transition hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e27e65] disabled:cursor-wait disabled:opacity-60 max-[420px]:px-2 max-[420px]:text-[10px]"
          disabled={isSigningOut}
          onClick={handleSignOut}
          type="button"
        >
          {isSigningOut ? t('authSigningOut') : t('authSignOut')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {/* Existing users can sign in; new users can create an account. */}
      <ButtonLink
        className="max-[420px]:min-h-[39px] max-[420px]:gap-1 max-[420px]:px-2 max-[420px]:text-[10px]"
        size="small"
        to="/login"
        variant="outline"
      >
        {t('loginLink')}
      </ButtonLink>
      <ButtonLink
        className="max-[420px]:min-h-[39px] max-[420px]:gap-1 max-[420px]:px-2 max-[420px]:text-[10px]"
        size="small"
        to="/register"
        variant="outline"
      >
        {t('createAccount')}
      </ButtonLink>
    </div>
  )
}
