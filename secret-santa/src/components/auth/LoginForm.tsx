import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AuthCredentials } from '../../models'
import { useTranslation } from '../../i18n/useTranslation'
import { useAuth } from '../../hooks/useAuth'
import { getAuthErrorKey } from '../../lib/authErrors'
import { toast } from '../../lib/toast'
import { AuthField } from './AuthField'

type LoginField = keyof AuthCredentials
type LoginErrors = Partial<Record<LoginField, string>>

function validateLoginForm(
  values: AuthCredentials,
  t: ReturnType<typeof useTranslation>['t'],
): LoginErrors {
  const errors: LoginErrors = {}

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = t('registerErrorEmail')
  }

  if (!values.password) {
    errors.password = t('loginErrorPasswordRequired')
  }

  return errors
}

export function LoginForm() {
  const { signIn } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [values, setValues] = useState<AuthCredentials>({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(field: LoginField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
    setServerError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError('')

    const nextErrors = validateLoginForm(values, t)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.keys(nextErrors)[0] as LoginField
      document.getElementById(`login-${firstError}`)?.focus()
      toast.add({
        type: 'error',
        title: t('authValidationTitle'),
        description: t('authValidationDescription'),
        priority: 'high',
      })
      return
    }

    setIsSubmitting(true)

    try {
      await signIn({
        email: values.email.trim(),
        password: values.password,
      })
      toast.add({
        type: 'success',
        title: t('loginSuccessTitle'),
        description: t('loginSuccess'),
      })
      navigate('/', { replace: true })
    } catch (error) {
      const message = t(getAuthErrorKey(error, 'login'))
      setServerError(message)
      toast.add({
        type: 'error',
        title: t('authErrorTitle'),
        description: message,
        priority: 'high',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
      {/* Existing account credentials. */}
      <div className="grid gap-4">
        <AuthField
          autoComplete="email"
          error={errors.email}
          id="login-email"
          label={t('fieldEmail')}
          maxLength={254}
          name="email"
          onChange={(event) => updateField('email', event.target.value)}
          placeholder={t('fieldEmailPlaceholder')}
          required
          type="email"
          value={values.email}
        />
        <AuthField
          autoComplete="current-password"
          error={errors.password}
          id="login-password"
          label={t('fieldPassword')}
          name="password"
          onChange={(event) => updateField('password', event.target.value)}
          placeholder={t('fieldPasswordPlaceholder')}
          required
          type="password"
          value={values.password}
        />
      </div>

      {/* Authentication failures are shown inline and announced with a toast. */}
      {serverError && (
        <p
          aria-live="assertive"
          className="m-0 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
          role="alert"
        >
          {serverError}
        </p>
      )}

      {/* Submit action and link to account creation. */}
      <button
        aria-busy={isSubmitting}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#174b3a] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(23,75,58,0.16)] transition hover:bg-[#0d3026] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e27e65] disabled:cursor-wait disabled:opacity-65"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? t('loginSubmitting') : t('loginSubmit')}
      </button>
      <p className="m-0 text-center text-sm text-[#52655a]">
        {t('loginRegisterPrompt')}{' '}
        <Link
          className="font-semibold text-[#174b3a] underline decoration-[#9db9a1] underline-offset-4 hover:text-[#0d3026]"
          to="/register"
        >
          {t('registerLink')}
        </Link>
      </p>
    </form>
  )
}
