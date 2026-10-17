import { useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { RegisterFormValues } from '../../models'
import { useTranslation } from '../../i18n/useTranslation'
import { useAuth } from '../../hooks/useAuth'
import { getAuthErrorKey } from '../../lib/authErrors'
import { toast } from '../../lib/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import { AuthField } from './AuthField'

type RegisterField = keyof RegisterFormValues | 'terms'
type RegisterErrors = Partial<Record<RegisterField, string>>

function validateRegisterForm(
  values: RegisterFormValues,
  acceptedTerms: boolean,
  t: ReturnType<typeof useTranslation>['t'],
): RegisterErrors {
  const errors: RegisterErrors = {}

  if (!values.name.trim()) {
    errors.name = t('registerErrorName')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = t('registerErrorEmail')
  }

  if (values.password.length < 8) {
    errors.password = t('registerErrorPassword')
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = t('registerErrorPasswordMismatch')
  }

  if (!acceptedTerms) {
    errors.terms = t('registerErrorTerms')
  }

  return errors
}

export function RegisterForm() {
  const { signUp } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [values, setValues] = useState<RegisterFormValues>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(field: keyof RegisterFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const nextErrors = { ...current }
      delete nextErrors[field]

      if (field === 'password') {
        delete nextErrors.confirmPassword
      }

      return nextErrors
    })
    setServerError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError('')

    const nextErrors = validateRegisterForm(values, acceptedTerms, t)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.keys(nextErrors)[0] as RegisterField
      document.getElementById(`register-${firstError}`)?.focus()
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
      const session = await signUp({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      })

      if (session) {
        toast.add({
          type: 'success',
          title: t('registerSuccessTitle'),
          description: t('registerSuccess'),
        })
        navigate('/', { replace: true })
      } else {
        toast.add({
          type: 'info',
          title: t('registerCheckEmailTitle'),
          description: t('registerCheckEmail'),
        })
      }
    } catch (error) {
      const errorKey = getAuthErrorKey(error, 'register')
      const message = t(errorKey)

      setServerError(message)
      if (errorKey === 'registerErrorWeakPassword') {
        setErrors((current) => ({ ...current, password: message }))
      }
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
      {/* Personal details used to create the Supabase Auth account. */}
      <div className="grid gap-4">
        <AuthField
          autoComplete="name"
          error={errors.name}
          id="register-name"
          label={t('fieldName')}
          maxLength={80}
          name="name"
          onChange={(event) => updateField('name', event.target.value)}
          placeholder={t('fieldNamePlaceholder')}
          required
          value={values.name}
        />
        <AuthField
          autoComplete="email"
          error={errors.email}
          id="register-email"
          label={t('fieldEmail')}
          maxLength={254}
          name="email"
          onChange={(event) => updateField('email', event.target.value)}
          placeholder={t('fieldEmailPlaceholder')}
          required
          type="email"
          value={values.email}
        />
      </div>

      {/* Password requirements are helpful context; validation stays inline. */}
      <div className="grid gap-4">
        <AuthField
          autoComplete="new-password"
          error={errors.password}
          hint={t('passwordHint')}
          id="register-password"
          label={t('fieldPassword')}
          labelAction={
            <TooltipProvider delay={250}>
              <Tooltip>
                <TooltipTrigger
                  aria-label={t('registerPasswordInfoLabel')}
                  className="grid size-7 place-items-center rounded-full text-[#476454] transition hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#285d43]"
                  type="button"
                >
                  <Info aria-hidden="true" className="size-4" />
                </TooltipTrigger>
                <TooltipContent align="end" className="max-w-[260px] whitespace-normal">
                  {t('registerPasswordTooltip')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
          minLength={8}
          name="password"
          onChange={(event) => updateField('password', event.target.value)}
          placeholder={t('fieldPasswordPlaceholder')}
          required
          type="password"
          value={values.password}
        />
        <AuthField
          autoComplete="new-password"
          error={errors.confirmPassword}
          id="register-confirm-password"
          label={t('registerConfirmPassword')}
          name="confirmPassword"
          onChange={(event) =>
            updateField('confirmPassword', event.target.value)
          }
          placeholder={t('registerConfirmPasswordPlaceholder')}
          required
          type="password"
          value={values.confirmPassword}
        />
      </div>

      {/* Account conditions and privacy summary are visible before acceptance. */}
      <div className="grid gap-3 rounded-2xl border border-[#dce5dc] bg-[#f7faf6] p-4">
        <details className="group" open>
          <summary className="cursor-pointer text-sm font-semibold text-[#244b37] marker:text-[#52835f]">
            {t('registerTermsSummaryTitle')}
          </summary>
          <div className="mt-3 grid gap-2 border-t border-[#dce5dc] pt-3 text-xs leading-[1.65] text-[#40584a]">
            <p className="m-0">{t('registerTermsSummary')}</p>
            <p className="m-0">{t('registerTermsRetention')}</p>
            <p className="m-0 font-medium text-[#7a5434]">
              {t('registerTermsDisclaimer')}
            </p>
          </div>
        </details>

        <div className="grid gap-2 border-t border-[#dce5dc] pt-3">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6 ${
              errors.terms
                ? 'border-[#b64235] bg-[#fff6f4] text-[#61362f]'
                : 'border-[#cdd8ce] bg-white text-[#243d32]'
            }`}
            htmlFor="register-terms"
          >
            <input
              aria-describedby={errors.terms ? 'register-terms-error' : undefined}
              aria-invalid={Boolean(errors.terms)}
              checked={acceptedTerms}
              className="mt-1 size-4 shrink-0 accent-[#1b674a]"
              id="register-terms"
              name="terms"
              onChange={(event) => {
                setAcceptedTerms(event.target.checked)
                setErrors((current) => {
                  const nextErrors = { ...current }
                  delete nextErrors.terms
                  return nextErrors
                })
                setServerError('')
              }}
              required
              type="checkbox"
            />
            <span>{t('termsAgreement')}</span>
          </label>
          {errors.terms && (
            <p
              className="m-0 text-xs font-medium leading-5 text-[#a23228]"
              id="register-terms-error"
              role="alert"
            >
              {errors.terms}
            </p>
          )}
        </div>
      </div>

      {/* Server failures remain visible here and are repeated through the toast. */}
      {serverError && (
        <p
          aria-live="assertive"
          className="m-0 rounded-xl border border-[#e7c8c0] bg-[#fff5f1] p-3 text-sm leading-6 text-[#8b392e]"
          role="alert"
        >
          {serverError}
        </p>
      )}

      {/* Submit action and link to the existing-account flow. */}
      <button
        aria-busy={isSubmitting}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#174b3a] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(23,75,58,0.16)] transition hover:bg-[#0d3026] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e27e65] disabled:cursor-wait disabled:opacity-65"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? t('registerSubmitting') : t('registerSubmit')}
      </button>
      <p className="m-0 text-center text-sm text-[#52655a]">
        {t('registerLoginPrompt')}{' '}
        <Link
          className="font-semibold text-[#174b3a] underline decoration-[#9db9a1] underline-offset-4 hover:text-[#0d3026]"
          to="/login"
        >
          {t('loginLink')}
        </Link>
      </p>
    </form>
  )
}
