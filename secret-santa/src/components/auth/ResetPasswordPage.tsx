import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getAuthErrorKey } from '../../lib/authErrors'
import { safeReturnTo } from '../../lib/authRedirect'
import { toast } from '../../lib/toast'
import { useTranslation } from '../../i18n/useTranslation'
import { AuthField } from './AuthField'
import { AuthPageLayout } from './AuthPageLayout'

export function ResetPasswordPage() {
  const { loading, user, updatePassword } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError(t('registerErrorPassword'))
      return
    }
    if (password !== confirmation) {
      setError(t('registerErrorPasswordMismatch'))
      return
    }

    setIsSubmitting(true)
    try {
      await updatePassword(password)
      toast.add({
        type: 'success',
        title: t('resetPasswordSuccessTitle'),
        description: t('resetPasswordSuccess'),
      })
      navigate(returnTo, { replace: true })
    } catch (updateError) {
      setError(t(getAuthErrorKey(updateError, 'login')))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageLayout
      allowAuthenticated
      description={t('resetPasswordDescription')}
      eyebrow={t('resetPasswordEyebrow')}
      title={t('resetPasswordTitle')}
    >
      {loading ? (
        <p aria-live="polite" className="m-0 text-sm text-[#52655a]">
          {t('authCheckingSession')}
        </p>
      ) : !user ? (
        <div className="grid gap-4 text-center">
          <p className="m-0 text-sm leading-6 text-[#52655a]">
            {t('resetPasswordLinkExpired')}
          </p>
          <Link
            className="font-semibold text-[#174b3a] underline underline-offset-4"
            to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {t('loginLink')}
          </Link>
        </div>
      ) : (
        <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
          <AuthField
            autoComplete="new-password"
            id="reset-password"
            label={t('fieldPassword')}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('fieldPasswordPlaceholder')}
            required
            type="password"
            value={password}
          />
          <AuthField
            autoComplete="new-password"
            id="reset-password-confirm"
            label={t('registerConfirmPassword')}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={t('registerConfirmPasswordPlaceholder')}
            required
            type="password"
            value={confirmation}
          />
          {error && (
            <p
              aria-live="assertive"
              className="m-0 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
              role="alert"
            >
              {error}
            </p>
          )}
          <button
            aria-busy={isSubmitting}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#174b3a] px-5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? t('resetPasswordSubmitting')
              : t('resetPasswordSubmit')}
          </button>
        </form>
      )}
    </AuthPageLayout>
  )
}
